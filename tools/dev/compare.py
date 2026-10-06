"""Compares the derived answers of two import runs, e.g. before/after an importer change.

Usage: python3 tools/dev/compare.py <newImportDir> <oldImportDir>
"""
import json, sys, glob, os
a_dir, b_dir = sys.argv[1], sys.argv[2]
diff = 0; same = 0
for f in sorted(glob.glob(a_dir + "/*.json")):
    A = {q["key"]: q for q in json.load(open(f))["questions"]}
    B = {q["key"]: q for q in json.load(open(os.path.join(b_dir, os.path.basename(f))))["questions"]}
    for k, qa in A.items():
        qb = B.get(k)
        if not qb or qa["interaction"]["kind"] != "gaps": continue
        for i, (ga, gb) in enumerate(zip(qa["interaction"]["gaps"], qb["interaction"]["gaps"])):
            va = ga.get("correct", ga.get("expected")); vb = gb.get("correct", gb.get("expected"))
            if va is not None and vb is not None:
                if va != vb:
                    diff += 1
                    print(k, "gap", i, ga.get("options"), "with:", va, ga.get("via"), "without:", vb, gb.get("via"))
                else: same += 1
print("agree", same, "disagree", diff)
