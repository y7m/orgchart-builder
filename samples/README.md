# Sample org CSVs

Generated with `python3 scripts/gen_dummy_org.py --all` (seed 42 plus n, so every run gives the same files).
Check them with `python3 scripts/validate_org.py samples/org_*.csv`.

| File | Rows | Max depth (CEO=1) | Managers | Span median / mean / max | Spans 1-2 / 3-5 / 6-10 / 11-14 / 15-25 / 26+ |
|---|---|---|---|---|---|
| org_200.csv  | 200  | 7 | 49  | 3 / 4.0 / 10 | 21 / 16 / 12 / 0 / 0 / 0 |
| org_2000.csv | 2000 | 9 | 370 | 5 / 5.4 / 21 | 55 / 150 / 154 / 3 / 8 / 0 |
| org_5000.csv | 5000 | 9 | 791 | 6 / 6.3 / 27 | 26 / 281 / 454 / 9 / 20 / 1 |

Depth for org_2000: L1:1 L2:10 L3:44 L4:106 L5:301 L6:636 L7:419 L8:417 L9:63.
The CEO has 10 direct reports: 8 C-suite, an EA and a Chief of Staff.
The widest spans (15 to 27) belong to Tier 1 and Tier 2 Support team leads.

Department sizes for org_2000 (5000 is the same mix at 2.5x; 200 is a smaller version of the same mix):
Engineering 792 (39.6%), Sales 297, Customer Support 237, Operations 120, Marketing 120, Product 100,
Data 99, Finance 80, IT & Security 79, Human Resources 60, Legal 9, Executive Office 7.
Engineering is the deepest department (9 levels); Legal is flat (3 levels).
Locations: Tel Aviv 31%, NYC 18%, Remote 17%, Kraków 13%, London 11%, Bangalore 10%.
Employment types: FTE about 95%, Contractor about 4% (Support about 12%), Intern about 1%, plus 2 Vacancy rows.

## Columns
`ID, Name, Title, Manager, Division, Subtopics` are read by the current importer.
`TeamName, OrgPath, Location, Email, EmploymentType, StartDate, CostCenter` are ignored today. They are there for a future Entra mapping: `officeLocation`, `mail`, `employeeType`, `employeeHireDate` and `costCenter`. `Division` maps to `department`, `Title` to `jobTitle`, and `ID` to `employeeId`.
The Manager column holds the manager's ID, never a name.

## Edge cases (intentional)
- **3 roots.** The CEO (E000001), a "Strategic Advisor" contractor and one Sales IC have an empty Manager.
- **1 dangling manager.** One Customer Support IC points to an ID that does not exist (a gap ID).
- **Vacant managers.** 2 in the 2000 and 5000 files, 1 in the 200 file. The row is named `Vacant (REQ-nnnn)`, has EmploymentType=Vacancy and no email, and its reports still point to it.
- **Duplicate full names.** 10 names are shared in the 2000 and 5000 files ("David Cohen" appears 3 times); 4 pairs in the 200 file. The duplicates are in different departments.
- **Special names.** Apostrophes (O'Brien, D'Angelo), hyphens, diacritics (Müller, Łukasz, Ångström), a comma (`"Carlos Mendoza, Jr."`, which needs CSV quoting), a mononym (`Aditya`), Hebrew (`יעל כהן`) and CJK (`王芳`). Email addresses are ASCII-folded and deduplicated with a number suffix.
- **Varied reporting lines.** Some ICs report directly to VPs or Directors (Principal Engineers, TPMs, Chiefs of Staff), and EAs report to the CEO, CTO, CRO and COO.
- **IDs follow hire date, with gaps.** Many managers have a higher ID than their reports, so manager references often point forward in the file.

## Importer notes
- **Uppercase IDs don't resolve.** `massImportEmployees` stores `extId` as-is but lowercases the Manager value before looking it up, so `E000123` never matches. In a Node simulation of the real store, 0 of 2000 managers resolved and everyone fell back to the root. Fix the lookup, or generate with `--lowercase-ids` (1996 of 2000 then resolve; the other 4 are the 3 roots and the dangling row).
- **Unresolved managers fall back to the root.** When a root already exists, orphans and dangling rows are silently attached to it. When the chart is empty, there is no root to fall back to, so a file with several roots makes `d3.stratify` throw "multiple roots" and the canvas renders nothing.
- **Duplicate names can collide.** Name lookup keeps whichever row came last. That is harmless when Manager is an ID, but a manager given by name would resolve silently to the wrong person.
- **Header naming.** The `[^a-z0-ind]` regex is effectively `[^a-z0-9]` except that it also keeps `_`. So `Employee_ID` is not recognised, while `Employee ID` and `EmployeeID` are. A header named `Team` maps to division and would overwrite Division, so this file uses `TeamName`. Any header containing `job` maps to title.
