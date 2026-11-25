// Roci's C surface over llama.cpp: plain C types in and out, strings returned malloc'd for the caller to free.

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "llama.h"

extern "C" {

// The backends llama.cpp sees (ggml's, shared with transcribe.cpp), as text.
const char * roci_llama_system_info(void) {
    llama_backend_init();
    return llama_print_system_info();
}

// Loads the GGUF at `path`, greedily continues `prompt` for up to `n_predict` tokens and returns the text (NULL on failure).
char * roci_llama_probe(const char * path, const char * prompt, int n_predict) {
    llama_backend_init();
    llama_model * model = llama_model_load_from_file(path, llama_model_default_params());
    if (model == nullptr) {
        return nullptr;
    }
    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = 512;
    llama_context * ctx = llama_init_from_model(model, cparams);
    const llama_vocab * vocab = llama_model_get_vocab(model);
    std::vector<llama_token> tokens(512);
    const int n = llama_tokenize(vocab, prompt, (int) std::strlen(prompt), tokens.data(), (int) tokens.size(), true, true);
    std::string text;
    if (ctx != nullptr && n > 0) {
        llama_sampler * sampler = llama_sampler_chain_init(llama_sampler_chain_default_params());
        llama_sampler_chain_add(sampler, llama_sampler_init_greedy());
        llama_batch batch = llama_batch_get_one(tokens.data(), n);
        for (int i = 0; i < n_predict && llama_decode(ctx, batch) == 0; ++i) {
            llama_token next = llama_sampler_sample(sampler, ctx, -1);
            if (llama_vocab_is_eog(vocab, next)) {
                break;
            }
            char piece[128];
            const int len = llama_token_to_piece(vocab, next, piece, sizeof(piece), 0, false);
            text.append(piece, len > 0 ? len : 0);
            tokens[0] = next;
            batch = llama_batch_get_one(tokens.data(), 1);
        }
        llama_sampler_free(sampler);
    }
    llama_free(ctx);
    llama_model_free(model);
    return strdup(text.c_str());
}

void roci_llama_free_string(char * value) {
    std::free(value);
}

}

// ---- Chat: one loaded model and its context; a reply runs one token at a time so Rust's GPU queue can step it aside.

#include <algorithm>
#include <mutex>
#include <set>
#include <stdexcept>

#include "chat.h"
#include "common.h"
#include "json.h"
#include "sampling.h"

using roci_event_fn      = void (*)(void * user, const char * event_json);
using roci_checkpoint_fn = void (*)(void);

static roci_checkpoint_fn g_checkpoint = nullptr;
static std::mutex         g_cancel_lock;
static std::set<uint64_t> g_cancelled;

struct roci_llama_chat {
    llama_model *             model = nullptr;
    llama_context *           ctx   = nullptr;
    common_chat_templates_ptr templates;
    std::vector<llama_token>  cached;  // the tokens the context holds, for reusing a shared start between turns
};

static void checkpoint() {
    if (g_checkpoint != nullptr) {
        g_checkpoint();
    }
}

static bool take_cancel(uint64_t id) {
    std::lock_guard<std::mutex> guard(g_cancel_lock);
    return g_cancelled.erase(id) > 0;
}

static char * reply_json(const common_json & value) {
    return strdup(value.dump().c_str());
}

static char * error_json(const std::string & message) {
    common_json value = common_json::object();
    value["ok"]       = false;
    value["error"]    = message;
    return reply_json(value);
}

static void emit(roci_event_fn on_event, void * user, const common_json & event) {
    on_event(user, event.dump().c_str());
}

static void emit_text(roci_event_fn on_event, void * user, const std::string & text) {
    if (text.empty()) {
        return;
    }
    common_json event = common_json::object();
    event["type"]     = "text";
    event["text"]     = text;
    emit(on_event, user, event);
}

static void emit_deltas(roci_event_fn on_event, void * user, const common_chat_msg & before, const common_chat_msg & after) {
    for (const auto & diff : common_chat_msg_diff::compute_diffs(before, after)) {
        emit_text(on_event, user, diff.content_delta);
    }
}

// The sampling the request asks for, over llama.cpp's defaults.
static common_params_sampling sampling_of(const common_json & request) {
    common_params_sampling sampling;
    sampling.temp            = request.value("temperature", sampling.temp);
    sampling.top_p           = request.value("top_p", sampling.top_p);
    sampling.top_k           = request.value("top_k", sampling.top_k);
    sampling.min_p           = request.value("min_p", sampling.min_p);
    sampling.penalty_repeat  = request.value("repetition_penalty", sampling.penalty_repeat);
    sampling.penalty_present = request.value("presence_penalty", sampling.penalty_present);
    sampling.penalty_freq    = request.value("frequency_penalty", sampling.penalty_freq);
    sampling.penalty_last_n  = request.value("penalty_last_n", sampling.penalty_last_n);
    return sampling;
}

// The template inputs of an OpenAI-style request: messages, tools, a JSON schema, thinking off unless asked.
static common_chat_templates_inputs inputs_of(const common_json & request) {
    common_chat_templates_inputs inputs;
    inputs.messages = common_chat_msgs_parse_oaicompat(request.at("messages"));
    if (request.contains("tools")) {
        inputs.tools = common_chat_tools_parse_oaicompat(request.at("tools"));
    }
    if (request.contains("json_schema")) {
        inputs.json_schema = request.at("json_schema").dump();
    }
    inputs.enable_thinking  = request.value("enable_thinking", false);
    inputs.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK;  // thinking, if any, stays out of the reply text
    return inputs;
}

// Caps thinking at `budget` tokens (0: a thought that starts is closed at once) with the template's own tags, the way
// llama.cpp's server does; false when the template has no thinking tags.
static bool cap_thinking(common_params_sampling & sampling, const common_chat_session & session, const llama_vocab * vocab, int budget) {
    if (session.thinking_end_tags().empty()) {
        return false;
    }
    sampling.reasoning_budget_tokens = budget;
    sampling.reasoning_budget_start  = common_tokenize(vocab, session.thinking_start_tag(), false, true);
    sampling.reasoning_budget_end.clear();
    for (const auto & tag : session.thinking_end_tags()) {
        if (!tag.empty()) {
            sampling.reasoning_budget_end.push_back(common_tokenize(vocab, tag, false, true));
        }
    }
    if (sampling.reasoning_budget_end.empty()) {
        return false;
    }
    sampling.reasoning_budget_forced = sampling.reasoning_budget_end.front();
    return true;
}

// Decodes `prompt` after the part of it the context already holds, in batches, with a checkpoint after each.
static void decode_prompt(roci_llama_chat * chat, const std::vector<llama_token> & prompt) {
    size_t keep = 0;
    while (keep < chat->cached.size() && keep < prompt.size() && chat->cached[keep] == prompt[keep]) {
        ++keep;
    }
    keep = std::min(keep, prompt.size() - 1);  // the last token is always decoded, for its logits
    llama_memory_seq_rm(llama_get_memory(chat->ctx), 0, (llama_pos) keep, -1);
    chat->cached.assign(prompt.begin(), prompt.begin() + keep);
    const size_t batch = llama_n_batch(chat->ctx);
    for (size_t i = keep; i < prompt.size(); i += batch) {
        const int n = (int) std::min(batch, prompt.size() - i);
        if (llama_decode(chat->ctx, llama_batch_get_one(const_cast<llama_token *>(&prompt[i]), n)) != 0) {
            throw std::runtime_error("the model could not read the prompt");
        }
        chat->cached.insert(chat->cached.end(), prompt.begin() + i, prompt.begin() + i + n);
        checkpoint();
    }
}

static bool ends_with_stop(const std::string & text, const std::vector<std::string> & stops) {
    return std::any_of(stops.begin(), stops.end(), [&](const std::string & stop) {
        return !stop.empty() && text.size() >= stop.size() && text.compare(text.size() - stop.size(), stop.size(), stop) == 0;
    });
}

extern "C" {

void roci_llama_set_checkpoint(roci_checkpoint_fn hook) {
    g_checkpoint = hook;
}

// Loads a chat model with a context of `n_ctx` tokens; NULL with `*error` set (malloc'd) on failure.
roci_llama_chat * roci_llama_chat_open(const char * path, int n_ctx, char ** error) {
    llama_backend_init();
    llama_model * model = llama_model_load_from_file(path, llama_model_default_params());
    if (model == nullptr) {
        *error = strdup("the model file could not be loaded");
        return nullptr;
    }
    llama_context_params params = llama_context_default_params();
    params.n_ctx                = n_ctx > 0 ? (uint32_t) n_ctx : 8192;
    llama_context * ctx         = llama_init_from_model(model, params);
    if (ctx == nullptr) {
        llama_model_free(model);
        *error = strdup("the model's context could not be created");
        return nullptr;
    }
    auto * chat      = new roci_llama_chat();
    chat->model      = model;
    chat->ctx        = ctx;
    chat->templates  = common_chat_templates_init(model, "");
    return chat;
}

void roci_llama_chat_close(roci_llama_chat * chat) {
    if (chat == nullptr) {
        return;
    }
    llama_free(chat->ctx);
    llama_model_free(chat->model);
    delete chat;
}

// Stops the reply with this stream id at its next token (or before it starts).
void roci_llama_cancel(uint64_t stream_id) {
    std::lock_guard<std::mutex> guard(g_cancel_lock);
    g_cancelled.insert(stream_id);
}

// One reply to an OpenAI-style request (messages, tools, json_schema, sampling, max_tokens, stream_id): text arrives on
// `on_event` as it is generated, tool calls when it ends. Returns {"ok", "promptTokens", "completionTokens", "cancelled"}.
char * roci_llama_chat_reply(roci_llama_chat * chat, const char * request_json, roci_event_fn on_event, void * user) {
    common_sampler * sampler = nullptr;
    try {
        const common_json request = common_json::parse(request_json);
        const uint64_t    id      = request.value("stream_id", (uint64_t) 0);
        const llama_vocab * vocab = llama_model_get_vocab(chat->model);
        const common_chat_templates_inputs inputs = inputs_of(request);
        common_chat_session session(chat->templates.get(), vocab, inputs);
        common_params_sampling sampling = sampling_of(request);
        session.apply_sampling(sampling);
        if (!inputs.json_schema.empty()) {
            sampling.grammar_lazy = false;  // the schema holds from the first token
        }
        const bool capped = !inputs.enable_thinking && cap_thinking(sampling, session, vocab, 0);
        sampler = common_sampler_init(chat->model, sampling);
        const auto prompt = common_tokenize(vocab, session.prompt().str(), true, true);
        const int  room   = (int) llama_n_ctx(chat->ctx) - (int) prompt.size();
        if (prompt.empty() || room <= 0) {
            throw std::runtime_error("the conversation is longer than the model's context");
        }
        decode_prompt(chat, prompt);
        const int limit     = std::min(request.value("max_tokens", room), room);
        common_chat_msg seen = session.msg();
        std::string text;
        int  produced  = 0;
        bool cancelled = take_cancel(id);
        while (!cancelled && produced < limit) {
            llama_token token = common_sampler_sample(sampler, chat->ctx, -1);
            common_sampler_accept(sampler, token, true);
            if (llama_vocab_is_eog(vocab, token)) {
                break;
            }
            ++produced;
            const std::string piece = common_token_to_piece(vocab, token, sampling.preserved_tokens.count(token) > 0);
            common_chat_input chunk;
            chunk.append(piece, token);
            const common_chat_msg & now = session.feed(chunk);
            emit_deltas(on_event, user, seen, now);
            seen = now;
            text += piece;
            if (ends_with_stop(text, session.additional_stops())) {
                break;
            }
            if (llama_decode(chat->ctx, llama_batch_get_one(&token, 1)) != 0) {
                throw std::runtime_error("the model stopped while answering");
            }
            chat->cached.push_back(token);
            checkpoint();
            cancelled = take_cancel(id);
        }
        const common_chat_msg & final_msg = session.finish();
        emit_deltas(on_event, user, seen, final_msg);
        for (size_t i = 0; i < final_msg.tool_calls.size(); ++i) {
            const auto & call = final_msg.tool_calls[i];
            common_json event  = common_json::object();
            event["type"]      = "tool-call";
            event["id"]        = call.id.empty() ? "call_" + std::to_string(i) : call.id;
            event["name"]      = call.name;
            event["arguments"] = call.arguments;
            emit(on_event, user, event);
        }
        common_sampler_free(sampler);
        common_json result         = common_json::object();
        result["ok"]               = true;
        result["promptTokens"]     = (int) prompt.size();
        result["completionTokens"] = produced;
        result["cancelled"]        = cancelled;
        result["thinkingCapped"]   = capped;
        return reply_json(result);
    } catch (const std::exception & e) {
        if (sampler != nullptr) {
            common_sampler_free(sampler);
        }
        return error_json(e.what());
    }
}

}

// ---- Embeddings: one model whose context pools each text into one vector (the model's own pooling, e.g. last token).

struct roci_llama_embedder {
    llama_model *   model = nullptr;
    llama_context * ctx   = nullptr;
};

// The unit-length vector of one text; throws when the model cannot read it.
static std::vector<float> embed_one(roci_llama_embedder * embedder, const std::string & text) {
    const llama_vocab * vocab = llama_model_get_vocab(embedder->model);
    std::vector<llama_token> tokens = common_tokenize(vocab, text, true, true);
    const size_t room = llama_n_batch(embedder->ctx);
    if (tokens.size() > room) {
        tokens.resize(room);
    }
    llama_memory_clear(llama_get_memory(embedder->ctx), true);
    if (tokens.empty() || llama_decode(embedder->ctx, llama_batch_get_one(tokens.data(), (int) tokens.size())) != 0) {
        throw std::runtime_error("the embedding model could not read a text");
    }
    const float * pooled = llama_get_embeddings_seq(embedder->ctx, 0);
    if (pooled == nullptr) {
        throw std::runtime_error("the embedding model gave no vector");
    }
    const int          n = llama_model_n_embd(embedder->model);
    std::vector<float> vector(n);
    common_embd_normalize(pooled, vector.data(), n, 2);
    return vector;
}

extern "C" {

// Loads an embedding model with a context of `n_ctx` tokens (a text longer than that is cut); NULL with `*error` set.
roci_llama_embedder * roci_llama_embed_open(const char * path, int n_ctx, char ** error) {
    llama_backend_init();
    llama_model * model = llama_model_load_from_file(path, llama_model_default_params());
    if (model == nullptr) {
        *error = strdup("the model file could not be loaded");
        return nullptr;
    }
    llama_context_params params = llama_context_default_params();
    params.n_ctx                = n_ctx > 0 ? (uint32_t) n_ctx : 8192;
    params.n_batch              = params.n_ctx;  // pooling reads a whole text in one pass
    params.n_ubatch             = params.n_ctx;
    params.embeddings           = true;
    llama_context * ctx         = llama_init_from_model(model, params);
    if (ctx == nullptr) {
        llama_model_free(model);
        *error = strdup("the model's context could not be created");
        return nullptr;
    }
    auto * embedder  = new roci_llama_embedder();
    embedder->model  = model;
    embedder->ctx    = ctx;
    return embedder;
}

void roci_llama_embed_close(roci_llama_embedder * embedder) {
    if (embedder == nullptr) {
        return;
    }
    llama_free(embedder->ctx);
    llama_model_free(embedder->model);
    delete embedder;
}

// Unit-length vectors for a JSON array of texts, in order, with a checkpoint after each: {"ok", "vectors"}.
char * roci_llama_embed(roci_llama_embedder * embedder, const char * texts_json) {
    try {
        const common_json texts   = common_json::parse(texts_json);
        common_json       vectors = common_json::array();
        for (size_t i = 0; i < texts.size(); ++i) {
            common_json row = common_json::array();
            for (const float value : embed_one(embedder, texts[(int) i].get<std::string>())) {
                row.push_back(value);
            }
            vectors.push_back(row);
            checkpoint();
        }
        common_json result = common_json::object();
        result["ok"]       = true;
        result["vectors"]  = vectors;
        return reply_json(result);
    } catch (const std::exception & e) {
        return error_json(e.what());
    }
}

}

// ---- Read aloud: a speech model and its audio projector (mtmd), driven the way llama.cpp's llama-tts does.

#include "mtmd-helper.h"
#include "mtmd.h"

struct roci_llama_voice {
    llama_model *             model = nullptr;
    llama_context *           ctx   = nullptr;
    mtmd_context *            mtmd  = nullptr;
    common_chat_templates_ptr templates;
};

// The voice bitmap for `name`, else the model's first predefined voice; null for a model without voices.
static mtmd_bitmap * voice_bitmap(roci_llama_voice * voice, const char * name) {
    if (mtmd_gen_audio_get_info(voice->mtmd).n_voices <= 0) {
        return nullptr;
    }
    const char * chosen = name != nullptr && name[0] != '\0' ? name : mtmd_gen_audio_voice_name(voice->mtmd, 0);
    return mtmd_gen_audio_get_voice(voice->mtmd, chosen);
}

// Runs the speech prompt, then one frame per step until the model ends the speech; a checkpoint after each step.
static void generate_frames(roci_llama_voice * voice, mtmd_helper_gen_audio * gen, const mtmd_helper_gen_audio_inp & inp) {
    if (mtmd_helper_gen_audio_set_input(gen, &inp) != 0) {
        throw std::runtime_error("the speech model rejected the text");
    }
    for (int32_t left = 1; left > 0;) {
        left = mtmd_helper_gen_audio_step_prompt(gen, (int32_t) llama_n_batch(voice->ctx));
        if (left < 0) {
            throw std::runtime_error("the speech model could not read the text");
        }
        checkpoint();
    }
    common_params_sampling sampling;
    sampling.penalty_repeat  = 1.05f;  // llama-tts's speech defaults
    sampling.penalty_last_n  = -1;
    common_sampler * sampler = common_sampler_init(voice->model, sampling);
    auto sample = [&]() {
        const llama_token token = common_sampler_sample(sampler, voice->ctx, -1);
        common_sampler_accept(sampler, token, true);
        return token;
    };
    llama_token   sampled = sample();
    const float * state   = llama_get_embeddings_ith(voice->ctx, -1);
    bool          stop    = false;
    for (int frames = 0; !stop && frames < 4096; ++frames) {
        const float * next = nullptr;
        if (mtmd_helper_gen_audio_step_gen(gen, sampled, state, &next, &stop) != 0 || next == nullptr) {
            break;
        }
        state   = next;
        sampled = sample();
        checkpoint();
    }
    common_sampler_free(sampler);
}

extern "C" {

// Loads a speech model and its audio projector; NULL with `*error` set when either fails or the pair cannot speak.
roci_llama_voice * roci_llama_voice_open(const char * path, const char * projector, char ** error) {
    llama_backend_init();
    llama_model * model = llama_model_load_from_file(path, llama_model_default_params());
    if (model == nullptr) {
        *error = strdup("the speech model file could not be loaded");
        return nullptr;
    }
    llama_context_params params = llama_context_default_params();
    params.embeddings           = true;             // the audio helper reads the hidden state (llama-tts does the same)
    params.n_batch              = params.n_ubatch;  // embeddings need the whole batch in one ubatch (common.cpp)
    llama_context * ctx  = llama_init_from_model(model, params);
    mtmd_context *  mtmd = ctx != nullptr ? mtmd_init_from_file(projector, model, mtmd_context_params_default()) : nullptr;
    if (mtmd == nullptr || mtmd_gen_audio_get_info(mtmd).type == MTMD_GEN_AUDIO_TYPE_NONE) {
        if (mtmd != nullptr) {
            mtmd_free(mtmd);
        }
        if (ctx != nullptr) {
            llama_free(ctx);
        }
        llama_model_free(model);
        *error = strdup("the model and its projector cannot speak");
        return nullptr;
    }
    auto * voice      = new roci_llama_voice();
    voice->model      = model;
    voice->ctx        = ctx;
    voice->mtmd       = mtmd;
    voice->templates  = common_chat_templates_init(model, "");
    return voice;
}

void roci_llama_voice_close(roci_llama_voice * voice) {
    if (voice == nullptr) {
        return;
    }
    mtmd_free(voice->mtmd);
    llama_free(voice->ctx);
    llama_model_free(voice->model);
    delete voice;
}

// Speaks `text` with the named voice (NULL: the model's first) in `lang` (NULL: the model's own); the WAV goes to
// `*wav` (malloc'd, `*wav_len` bytes). 0 on success, else -1 with `*error` set.
int roci_llama_speak(roci_llama_voice * voice, const char * text, const char * voice_name, const char * lang, unsigned char ** wav,
                     size_t * wav_len, char ** error) {
    mtmd_helper_gen_audio * gen = nullptr;
    try {
        llama_memory_clear(llama_get_memory(voice->ctx), true);
        std::string prompt = common_chat_get_tts_prompt(voice->templates.get(), text, lang ? lang : "", voice_name ? voice_name : "");
        if (prompt.empty()) {
            prompt = text;
        }
        mtmd::bitmap_ptr speaker(voice_bitmap(voice, voice_name));
        mtmd_helper_gen_audio_inp inp = mtmd_helper_gen_audio_inp_default();
        inp.seq_id      = 0;
        inp.prompt      = prompt.c_str();
        inp.prompt_len  = prompt.size();
        inp.speaker_ref = speaker.get();
        inp.lang        = lang;
        gen = mtmd_helper_gen_audio_init(voice->ctx, voice->mtmd);
        generate_frames(voice, gen, inp);
        int32_t      rate = 0;
        const char * data = nullptr;
        size_t       len  = 0;
        if (mtmd_helper_gen_audio_get_output(gen, &rate, &data, &len, nullptr) != 0 || len == 0) {
            throw std::runtime_error("the speech model made no audio");
        }
        *wav = (unsigned char *) std::malloc(len);
        std::memcpy(*wav, data, len);
        *wav_len = len;
        mtmd_helper_gen_audio_free(gen);
        return 0;
    } catch (const std::exception & e) {
        if (gen != nullptr) {
            mtmd_helper_gen_audio_free(gen);
        }
        *error = strdup(e.what());
        return -1;
    }
}

void roci_llama_free_bytes(unsigned char * bytes) {
    std::free(bytes);
}

}

// ---- Memory: the process's physical footprint (what iOS's per-app limit counts) and, on iOS, how much more it may use.

#include <TargetConditionals.h>
#include <mach/mach.h>
#if TARGET_OS_IOS
#include <os/proc.h>
#endif

#include <dispatch/dispatch.h>

using roci_pressure_fn = void (*)(int level);

static dispatch_source_t g_pressure    = nullptr;
static roci_pressure_fn  g_on_pressure = nullptr;

static void pressure_event(void *) {
    const unsigned long level = dispatch_source_get_data(g_pressure);
    g_on_pressure((level & DISPATCH_MEMORYPRESSURE_CRITICAL) != 0 ? 2 : 1);
}

// How much more the app may use: iOS's own per-app answer; on the Mac, free plus inactive (reclaimable) memory.
static uint64_t available_memory() {
#if TARGET_OS_IOS
    return (uint64_t) os_proc_available_memory();
#else
    vm_statistics64_data_t stats = {};
    mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;
    if (host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t) &stats, &count) != KERN_SUCCESS) {
        return 0;
    }
    return ((uint64_t) stats.free_count + stats.inactive_count) * (uint64_t) vm_kernel_page_size;
#endif
}

extern "C" {

// {"ok", "footprint", "footprintPeak", "available"} in bytes; footprintPeak is the highest since launch, available how
// much more the app may use (0 when unknown).
char * roci_llama_memory(void) {
    task_vm_info_data_t    info  = {};
    mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    const bool read = task_info(mach_task_self(), TASK_VM_INFO, (task_info_t) &info, &count) == KERN_SUCCESS;
    common_json result      = common_json::object();
    result["ok"]            = true;
    result["footprint"]     = read ? (uint64_t) info.phys_footprint : (uint64_t) 0;
    result["footprintPeak"] = read ? (uint64_t) info.ledger_phys_footprint_peak : (uint64_t) 0;
    result["available"]     = available_memory();
    return reply_json(result);
}

// Calls `on_pressure` (1 = warning, 2 = critical) whenever the system reports memory pressure; set once.
void roci_llama_watch_pressure(roci_pressure_fn on_pressure) {
    if (g_pressure != nullptr) {
        return;
    }
    g_on_pressure = on_pressure;
    g_pressure    = dispatch_source_create(DISPATCH_SOURCE_TYPE_MEMORYPRESSURE, 0,
                                           DISPATCH_MEMORYPRESSURE_WARN | DISPATCH_MEMORYPRESSURE_CRITICAL,
                                           dispatch_get_global_queue(QOS_CLASS_UTILITY, 0));
    dispatch_source_set_event_handler_f(g_pressure, pressure_event);
    dispatch_activate(g_pressure);
}

}

// ---- Model facts without loading its weights: a GGUF header's context length and chat template, and the memory
// llama.cpp projects for a context (the measure behind its --fit).

#include "fit.h"
#include "gguf.h"

extern "C" {

// {"ok", "contextTokens"?, "chatTemplate"?} for the GGUF at `path`.
char * roci_llama_model_info(const char * path) {
    gguf_init_params params = { /*no_alloc =*/ true, /*ctx =*/ nullptr };
    gguf_context * gguf = gguf_init_from_file(path, params);
    if (gguf == nullptr) {
        return error_json("the model file could not be read");
    }
    common_json result = common_json::object();
    result["ok"]       = true;
    const int64_t arch = gguf_find_key(gguf, "general.architecture");
    if (arch >= 0) {
        const std::string key  = std::string(gguf_get_val_str(gguf, arch)) + ".context_length";
        const int64_t     slot = gguf_find_key(gguf, key.c_str());
        if (slot >= 0) {
            result["contextTokens"] = (uint64_t) gguf_get_val_u32(gguf, slot);
        }
    }
    const int64_t tmpl = gguf_find_key(gguf, "tokenizer.chat_template");
    if (tmpl >= 0) {
        result["chatTemplate"] = gguf_get_val_str(gguf, tmpl);
    }
    gguf_free(gguf);
    return reply_json(result);
}

// The KV cache type named `name` (f16, q8_0, q4_0 …), as llama-server's --cache-type-k takes it; f16 when unknown.
static ggml_type kv_type_of(const char * name) {
    for (int t = 0; t < GGML_TYPE_COUNT; t++) {
        const char * type_name = ggml_type_name((ggml_type) t);
        if (type_name != nullptr && name != nullptr && std::strcmp(type_name, name) == 0) {
            return (ggml_type) t;
        }
    }
    return GGML_TYPE_F16;
}

// {"ok", "bytes", "contextTokens"} for the GGUF at `path` run as llama-server runs it (4 slots on one unified KV cache)
// with a context of `n_ctx` tokens (0: the model's own) and a KV cache of `kv_type`: weights, KV cache and compute
// buffers as llama.cpp sizes them, measured with nothing allocated and no weights read.
char * roci_llama_project_memory(const char * path, int n_ctx, const char * kv_type) {
    common_params params;
    params.model.path   = path;
    params.n_ctx        = n_ctx;
    params.n_parallel   = 4;
    params.kv_unified   = true;
    params.cache_type_k = kv_type_of(kv_type);
    params.cache_type_v = params.cache_type_k;
    llama_backend_init();
    try {
        const llama_model_params   mparams = common_model_params_to_llama(params);
        const llama_context_params cparams = common_context_params_to_llama(params);
        uint32_t                   n_ctx_used = 0;
        const auto rows = common_fit_measure(params.model.get_paths(), &mparams, &cparams, nullptr, &n_ctx_used, GGML_LOG_LEVEL_ERROR);
        // What the context costs: its KV cache and compute buffers. The weights are mapped from the file, so they don't
        // count against the app's memory.
        uint64_t bytes = 0;
        for (const auto & row : rows) {
            bytes += row.context + row.compute;
        }
        common_json result     = common_json::object();
        result["ok"]           = true;
        result["bytes"]        = bytes;
        result["contextTokens"] = n_ctx_used;
        return reply_json(result);
    } catch (const std::exception & e) {
        return error_json(e.what());
    }
}

}

