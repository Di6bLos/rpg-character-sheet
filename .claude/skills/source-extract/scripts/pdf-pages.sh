#!/usr/bin/env bash
# Cache a PDF's pages as text, one file per page, and search the cache.
#
#   pdf-pages.sh extract <file.pdf> [first] [last]   # default: every page
#   pdf-pages.sh search  <book-slug> <regex>         # pages that match, with hit counts
#   pdf-pages.sh show    <book-slug> <page>          # print one cached page
#
# Pages are PDF page numbers (not printed page numbers; see rpg-rules/references/books.md).
# Cache: .local/text/<book-slug>/p###.txt, where book-slug is the PDF's basename.
# Already-cached pages are skipped, so re-running is cheap.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cache="$root/.local/text"

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

cmd="${1:-}"; shift || true
case "$cmd" in
    extract)
        pdf="${1:?pdf path}"
        command -v pdftotext >/dev/null || { echo "pdftotext not found (brew install poppler)" >&2; exit 1; }
        slug="$(basename "$pdf" .pdf)"
        total="$(pdfinfo "$pdf" | awk '/^Pages:/ {print $2}')"
        first="${2:-1}"
        last="${3:-$total}"
        (( last > total )) && last="$total"
        mkdir -p "$cache/$slug"
        made=0
        for (( p = first; p <= last; p++ )); do
            out="$cache/$slug/$(printf 'p%03d.txt' "$p")"
            [[ -s "$out" ]] && continue
            pdftotext -layout -f "$p" -l "$p" "$pdf" "$out"
            made=$((made + 1))
        done
        echo "$slug: pages $first-$last cached in .local/text/$slug ($made new, $total in book)"
        ;;
    search)
        slug="${1:?book slug}"; re="${2:?regex}"
        [[ -d "$cache/$slug" ]] || { echo "No cache for $slug; run extract first" >&2; exit 1; }
        grep -ciEH -- "$re" "$cache/$slug"/p*.txt | grep -v ':0$' \
            | sed -E 's#.*/p0*([0-9]+)\.txt:([0-9]+)#p\1 (\2 hits)#' || echo "no match"
        ;;
    show)
        slug="${1:?book slug}"; p="${2:?page}"
        cat "$cache/$slug/$(printf 'p%03d.txt' "$p")"
        ;;
    *) usage ;;
esac
