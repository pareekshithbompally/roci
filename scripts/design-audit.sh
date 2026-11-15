#!/usr/bin/env bash
# Read-only design-system ratchet; usage: design-audit.sh [--scope <dir>] [--save <label>].
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=src
LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    --save) LABEL="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

HUES='red|blue|green|amber|purple|violet|orange|yellow|gray|zinc|neutral|slate|pink|rose|sky|cyan|teal|emerald|lime|indigo|fuchsia|stone'
HUE_RE='\b[a-z]+-('"$HUES"')-[0-9]{2,3}\b'
# Semantic role classes written directly in feature code (features must use kit props instead)
ROLE_RE='(^|[^-a-z])(bg-(base|deep|layer-[1-4]|inverse|accent|knob|hover|pressed|scrim|separator|ai|(base|deep|raised)-glass|(danger|warning|success|info)(-subtle)?)|text-(primary|muted|faint|accent|inverse|on-accent|danger|warning|success|info|ai)|border-(muted|base|strong|focus|accent|danger|warning|success|info)|divide-(muted|base|strong)|ring-focus|shadow-(input|raised|floating|overlay)|rounded(-(sm|md|lg|xl|2xl|full))?)\b'
CODE=(--include='*.ts' --include='*.tsx')

# Occurrences of an extended regex in .ts/.tsx under $1, skipping comment lines.
COMMENT_RE='^[^:]*:[[:space:]]*(\*|//|/\*)'
hits() { { grep -rHE "$2" "$1" "${CODE[@]}" 2>/dev/null || true; } | { grep -vE "$COMMENT_RE" || true; } | cut -d: -f2- | { grep -oE "$2" || true; } | wc -l | tr -d ' '; }
# same, excluding a path prefix
hits_except() { { grep -rHE "$2" "$1" "${CODE[@]}" 2>/dev/null || true; } | { grep -v "^$3" || true; } | { grep -vE "$COMMENT_RE" || true; } | cut -d: -f2- | { grep -oE "$2" || true; } | wc -l | tr -d ' '; }
# files matching under $1, excluding a path prefix
files_except() { { grep -rlE "$2" "$1" "${CODE[@]}" 2>/dev/null || true; } | { grep -v "^$3" || true; } | wc -l | tr -d ' '; }

# Files outside tokens.css that hold colour literals (hex / rgb / rgba / hsl) in the style layer.
colour_files() {
  { ls index.css tailwind.config.js src/styles/*.css src/config/*.ts 2>/dev/null; } \
    | grep -v 'src/styles/tokens.css' \
    | while read -r f; do grep -qE '#[0-9a-fA-F]{6}\b|rgba?\(|hsla?\(' "$f" && echo "$f"; done
}

loc() {
  { find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.js' \); echo index.css; echo tailwind.config.js; } \
    | xargs cat | wc -l | tr -d ' '
}

bug() { if eval "$1"; then echo present; else echo gone; fi; }

report() {
  echo "# design-audit  scope=$SCOPE  $(date '+%Y-%m-%d %H:%M')"
  echo "paper_night_classes       $(hits "$SCOPE" '(paper|night)-[0-9]+')"
  echo "raw_tailwind_hues         $(hits "$SCOPE" "$HUE_RE")"
  echo "hex_literals              $(hits "$SCOPE" '#[0-9a-fA-F]{6}\b')"
  echo "px_outside_config         $(hits_except "$SCOPE" '\[[0-9.]+px\]' 'src/config/')"
  echo "dark_variants             $(hits "$SCOPE" 'dark:[a-z!\[]')"
  echo "font_size_arbitrary       $(hits "$SCOPE" 'text-\[[0-9.]+px\]')"
  echo "font_size_tw_default      $(hits "$SCOPE" '\btext-(xs|sm|base|lg|[2-9]?xl)\b')"
  echo "raw_button                $(hits_except "$SCOPE" '<button\b' 'src/shared/ui/')"
  echo "raw_input                 $(hits_except "$SCOPE" '<input\b' 'src/shared/ui/')"
  echo "raw_textarea              $(hits_except "$SCOPE" '<textarea\b' 'src/shared/ui/')"
  echo "radix_outside_kit_files   $(files_except "$SCOPE" "from '@radix-ui" 'src/shared/ui/')"
  echo "style_config_importers    $({ grep -rlE '@config/(theme|typography)\.config' "$SCOPE" "${CODE[@]}" 2>/dev/null || true; } | { grep -E '^src/(features|shared/components)/' || true; } | wc -l | tr -d ' ')"
  echo "deep_shared_ui_imports    $(hits "$SCOPE" "from '@shared/ui/")"
  echo "role_classes_in_features  $( [ "${SCOPE#src/features}" != "$SCOPE" ] || [ "$SCOPE" = src ] && hits_except "$SCOPE" "$ROLE_RE" "src/[^f]" || echo 0)"
  if [ "$SCOPE" = src ]; then
    echo "colour_literal_files      $(colour_files | wc -l | tr -d ' ')   ($(colour_files | tr '\n' ' '))"
    echo "total_lines               $(loc)"
    echo "unused_locals             $(npx tsc --noEmit --noUnusedLocals 2>&1 | grep -cE 'error TS6(133|192|196|198)' || true)"
    echo "bug_glass_fbfaf7          $(bug "grep -q '#fbfaf7' src/styles/glass.css")"
    echo "bug_text_warning_undef    $(bug "grep -rq 'var(--text-warning' src && ! grep -rqE -- '--text-warning:' index.css src/styles")"
    echo "bug_dark_muted_eq_faint   $(bug "grep -q -- '--text-muted: #666666' index.css && grep -q -- '--text-faint: #666666' index.css")"
  fi
}

OUT="$(report)"
echo "$OUT"
if [ -n "$LABEL" ]; then
  DIR=docs/plans/DONE/design-system/audit
  mkdir -p "$DIR"
  echo "$OUT" > "$DIR/$LABEL.txt"
  echo "saved $DIR/$LABEL.txt"
fi
