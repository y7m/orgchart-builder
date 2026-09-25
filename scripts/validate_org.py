#!/usr/bin/env python3
"""Validate org CSVs from gen_dummy_org.py: roots, cycles, unresolved managers, depth/span/dept stats.
Usage: python3 scripts/validate_org.py samples/org_*.csv
Exit code 1 if an unexpected structural problem is found (expected: 3 roots = CEO + 2 orphans, 1 dangling)."""
import csv
import sys
from collections import Counter, defaultdict

EXPECTED_ROOTS, EXPECTED_DANGLING = 3, 1


def check(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    ids = [r["ID"] for r in rows]
    by_id = {r["ID"]: r for r in rows}
    ok = True
    dup_ids = [i for i, c in Counter(ids).items() if c > 1]
    roots = [r for r in rows if not r["Manager"]]
    dangling = [r for r in rows if r["Manager"] and r["Manager"] not in by_id]
    kids = defaultdict(list)
    for r in rows:
        if r["Manager"] in by_id:
            kids[r["Manager"]].append(r["ID"])
    # depth via BFS from roots; anything unreached (other than dangling subtrees) is in a cycle
    depth, stack = {}, [(r["ID"], 1) for r in roots]
    while stack:
        i, d = stack.pop()
        depth[i] = d
        stack += [(k, d + 1) for k in kids[i]]
    unreached = [i for i in ids if i not in depth and by_id[i] not in dangling]
    cycles = []
    for i in unreached:  # confirm cycle by walking up
        seen, cur = set(), i
        while cur in by_id and cur not in seen:
            seen.add(cur)
            cur = by_id[cur]["Manager"]
        if cur in seen:
            cycles.append(i)

    print(f"\n== {path}  ({len(rows)} rows)")
    print(f"dup IDs: {len(dup_ids)}  roots: {len(roots)} -> " +
          "; ".join(f"{r['ID']} {r['Name']} ({r['Title']})" for r in roots))
    print(f"unresolved managers: {len(dangling)} -> " +
          "; ".join(f"{r['ID']} {r['Name']} -> {r['Manager']}" for r in dangling))
    print(f"cycles: {len(cycles)}  unreached-not-dangling: {len(unreached)}")
    ok &= not dup_ids and not cycles and len(roots) == EXPECTED_ROOTS and len(dangling) == EXPECTED_DANGLING
    ok &= roots[0]["Title"] == "Chief Executive Officer"

    ceo = next(r["ID"] for r in rows if r["Title"] == "Chief Executive Officer")
    dd = Counter(depth[i] for i in depth if _under(i, ceo, by_id))
    print("depth (CEO=1):", " ".join(f"L{d}:{dd[d]}" for d in sorted(dd)), f"| max {max(dd)}")

    spans = sorted(len(v) for v in kids.values() if v)
    hist = Counter()
    for s in spans:
        hist["1-2" if s <= 2 else "3-5" if s <= 5 else "6-10" if s <= 10 else "11-14" if s <= 14
             else "15-25" if s <= 25 else "26+"] += 1
    print(f"managers: {len(spans)}  span min/median/mean/max: {spans[0]}/{spans[len(spans) // 2]}/"
          f"{sum(spans) / len(spans):.1f}/{spans[-1]}  hist: " +
          " ".join(f"{k}:{hist[k]}" for k in ["1-2", "3-5", "6-10", "11-14", "15-25", "26+"]))
    print(f"CEO direct reports: {len(kids[ceo])}")
    dept = Counter(r["Division"] for r in rows)
    ddepth = defaultdict(int)
    for i, d in depth.items():
        ddepth[by_id[i]["Division"]] = max(ddepth[by_id[i]["Division"]], d)
    print("depts:", ", ".join(f"{k} {v} ({100 * v / len(rows):.1f}%, depth {ddepth[k]})" for k, v in dept.most_common()))
    print("locations:", dict(Counter(r["Location"] for r in rows).most_common()))
    print("employment:", dict(Counter(r["EmploymentType"] for r in rows).most_common()))
    names = Counter(r["Name"] for r in rows)
    print("duplicate names:", {n: c for n, c in names.items() if c > 1})
    emails = [r["Email"] for r in rows if r["Email"]]
    print(f"emails unique: {len(set(emails)) == len(emails)}  vacancies: "
          f"{[r['ID'] + ' ' + r['Name'] + ' reports=' + str(len(kids[r['ID']])) for r in rows if r['EmploymentType'] == 'Vacancy']}")
    special = [r["Name"] for r in rows if any(ch in r["Name"] for ch in "'-,") or not r["Name"].isascii()]
    print(f"names w/ apostrophe/hyphen/comma/non-ASCII: {len(special)}")
    print("RESULT:", "OK" if ok else "FAIL")
    return ok


def _under(i, root, by_id):
    seen = set()
    while i and i not in seen:
        if i == root:
            return True
        seen.add(i)
        i = by_id.get(i, {}).get("Manager")
    return False


if __name__ == "__main__":
    sys.exit(0 if all([check(p) for p in sys.argv[1:]]) else 1)
