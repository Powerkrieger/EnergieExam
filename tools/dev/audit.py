"""Prints a random sample of resolved questions (answer next to the official solution) for manual checking.

Usage: python3 tools/dev/audit.py <importDir> [seed] [count] [gaps]
"""
import json, glob, random, sys
ONLY_GAPS = len(sys.argv) > 4
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
qs = []
for f in sorted(glob.glob(sys.argv[1] + "/*.json")):
    for q in json.load(open(f))["questions"]:
        i = q["interaction"]
        if i["kind"] == "single" and i["correct"] is not None and not ONLY_GAPS: qs.append(q)
        elif i["kind"] == "gaps" and all(g.get("correct", g.get("expected")) is not None for g in i["gaps"]): qs.append(q)
for q in random.sample(qs, int(sys.argv[3]) if len(sys.argv) > 3 else 20):
    i = q["interaction"]
    print(f"## {q['key']}")
    if i["kind"] == "single":
        print("  ANSWER:", i["options"][i["correct"]][:110])
    else:
        for r in i["rows"]:
            line = " ".join(s["text"] if "text" in s else
                ("[" + (i["gaps"][s["gap"]]["options"][i["gaps"][s["gap"]]["correct"]] if i["gaps"][s["gap"]]["kind"] == "choice" else str(i["gaps"][s["gap"]]["expected"])) + "]")
                for s in r)
            if "[" in line: print("  ", line[:170])
    print("  SOL:", " / ".join(q["solution"])[:400])
