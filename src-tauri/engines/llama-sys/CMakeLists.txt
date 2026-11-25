# llama.cpp (on the ggml transcribe-cpp-sys installed) and Roci's shim over its public API, built together for
# roci-llama-sys.
cmake_minimum_required(VERSION 3.18)
project(roci_llama C CXX)

set(LLAMA_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/../llama.cpp")
add_subdirectory(${LLAMA_SOURCE} llama)

add_library(roci-llama STATIC shim/roci_llama.cpp)
target_link_libraries(roci-llama PRIVATE llama-common mtmd)
target_compile_features(roci-llama PRIVATE cxx_std_17)
