"""Pretty-prints questions from `cli.ts show` for review.

Usage: node packages/importer/src/cli.ts show private/pdfs/nwg1.pdf 1.1.1.07 | python3 tools/dev/fmt.py
"""
import json, sys
data = sys.stdin.read().replace("}\n{", "}\x00{").split("\x00")
for chunk in data:
    if not chunk.strip().startswith("{"): print(chunk); continue
    q = json.loads(chunk); i = q["interaction"]
    print(f"=== {q['key']} [{i['kind']}] {q['topic']}  figs={len(q['figures'])}")
    for s in q["stem"]: print("  STEM:", s)
    if i["kind"] == "single":
        for n, o in enumerate(i["options"]): print("  ", "*" if n == i["correct"] else " ", o)
    if i["kind"] == "gaps":
        for r in i["rows"]:
            print("  ROW:", " ".join(s["text"] if "text" in s else f"[{s['gap']}]" for s in r))
        for n, g in enumerate(i["gaps"]):
            if g["kind"] == "choice": print(f"   gap{n}: {g['options']} -> {g['correct']} ({g.get('via')})")
            else: print(f"   gap{n}: text -> {g['expected']!r} {g.get('numeric')} ({g.get('via')})")
    for s in q["solution"]: print("  SOL:", s)
    for s in q["issues"]: print("  ISSUE:", s)
