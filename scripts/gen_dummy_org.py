#!/usr/bin/env python3
"""
gen_dummy_org.py - deterministic (seeded) generator of realistic dummy org-chart CSVs.

Usage:
  python3 scripts/gen_dummy_org.py --all                      # samples/org_{200,2000,5000}.csv
  python3 scripts/gen_dummy_org.py -n 2000 --seed 42 -o out.csv [--lowercase-ids]

Columns (importer core first, then extras that mirror Entra ID user attributes):
  ID              -> extId            (Entra: employeeId)
  Name            -> name             (Entra: displayName)
  Title           -> title            (Entra: jobTitle)
  Manager         -> manager (ID!)    (Entra: manager)
  Division        -> division         (Entra: department)
  Subtopics       -> subtopics        (0-3 comma-separated skills)
  TeamName        ignored today. NOT named "Team": normalizeRow maps k==='team' to
                  division, and being after Division it would overwrite it.
  OrgPath         ignored ("Engineering > Platform > Infrastructure > SRE")
  Location        ignored (Entra: officeLocation)
  Email           ignored (Entra: mail / userPrincipalName), first.last@contoso.example
  EmploymentType  ignored (Entra: employeeType) FTE | Contractor | Intern | Vacancy
  StartDate       ignored (Entra: employeeHireDate) ISO yyyy-mm-dd
  CostCenter      ignored (Entra: employeeOrgData.costCenter) CC-DDGG
  Avoid header names containing "job" (maps to title), "employeeid", "managerid",
  "reportsto", "fullname", or underscores (regex keeps "_", so Employee_ID won't match).

Structure:
  CEO -> 8 C-suite (CTO, CPO, CRO, COO, CMO, CFO, CHRO, GC) + EA + Chief of Staff.
  CTO -> Engineering (~40%, deepest: up to 7-8 levels), Data, IT & Security.
  COO -> Customer Support (~12%, wide teams: team leads with 15-25 reports), Operations.
  CPO/CRO/CMO/CFO/CHRO/GC lead Product/Sales/Marketing/Finance/HR/Legal directly.
  Legal is tiny (~0.4%, 9 at n=2000) and flat. Max depth (CEO=1): 7 @200, 9 @2000/5000
  (Engineering: CEO > CTO > SVP > VP > Dir > Sr EM > EM > TL > IC). Team sizes, allocations and span
  vary randomly; some ICs (principal engineers, TPMs, chiefs of staff) report
  straight to VPs/Directors; EAs report to CEO/CTO/CRO/COO.
  IDs are assigned in hire-date order with random gaps (terminated staff), so the
  CEO is E000001 and a manager can have a higher ID than their reports; rows
  are sorted by ID, so manager references often point forward in the file.

Deliberate edge cases (all deterministic per seed):
  1. Duplicate full names: 4 pairs (n<1000) / 10 pairs (n>=1000; one name is a
     triple), different people in different departments. Manager column uses IDs,
     so resolving by name would be ambiguous.
  2. Special-character names: apostrophes (Siobhan O'Brien), hyphens (Jose
     Alvarez-Ruiz), diacritics (Jurgen Muller-Ludenscheidt, Lukasz Wrobel-Nowak,
     Bjorn Angstrom -- with real accents in the file), a comma-bearing name
     ("Carlos Mendoza, Jr." -> CSV quoting), spaces/particles in surnames
     (Anne-Marie van der Berg, Sean O Suilleabhain), a mononym (Aditya), a Hebrew
     (RTL) name and a CJK name. Pools also contain Polish/German/Spanish/French
     accented names naturally. Emails are ASCII-folded.
  3. Vacant manager: 1 (n<1000) or 2 (Engineering + Customer Support) manager
     rows replaced by Name="Vacant (REQ-nnnn)", EmploymentType=Vacancy, no email,
     no start date. Their reports still point at the vacancy's ID.
  4. Orphans (empty Manager, i.e. extra roots besides the CEO): a "Strategic
     Advisor" contractor and one Sales Account Executive pending assignment.
  5. Dangling manager: one Customer Support IC whose Manager is an ID that does
     not exist in the file (a gap ID = departed manager).
  6. Near-duplicates: "Carlos Mendoza, Jr." vs a random "Carlos Mendoza" can co-occur.
  => Expected: 3 rows with empty Manager (CEO + 2 orphans), 1 unresolved Manager.
  Validate with: python3 scripts/validate_org.py samples/org_*.csv

Importer caveat (src/store/useOrgStore.js massImportEmployees): extIds are stored in
mappingDict as-is but the Manager value is lowercased before lookup, so uppercase IDs
("E000123") never resolve. Use --lowercase-ids until that is fixed.
"""
import argparse
import csv
import math
import random
import re
import unicodedata
from datetime import date, timedelta
from pathlib import Path

DOMAIN = "contoso.example"
C, SVP, VP, DIR, SRM, MGR, TL, IC = range(8)

# --------------------------------------------------------------------------------------
# Names
# --------------------------------------------------------------------------------------
S = str.split
CULTURES = {
    "israeli": (S("Noam Yael Omer Tamar Itay Noa Daniel Maya Yonatan Shira Eitan Michal Amit Roni Guy Hila Ido "
                  "Liat Tal Nadav Yuval Gal Ori Adi Asaf Keren Lior Moran Oren Rotem Shai Tomer Yoav Dana Avi "
                  "Efrat Gilad Inbar Nir Sivan Uri Yossi Ayelet Boaz Hadas Erez Einav Ariel Neta Elad"),
                S("Cohen Levi Mizrahi Peretz Biton Dahan Avraham Friedman Azoulay Katz Yosef David Ohana Shapiro "
                  "Ben-David Goldberg Rosenberg Ben-Ami Malka Hadad Amar Gabay Shalom Weiss Klein Ashkenazi Sasson "
                  "Barak Carmeli Golan Harel Segal Zohar Ben-Haim Almog Rubin Stern Navon Elbaz Shemesh Avidan "
                  "Lavi Tzur Oz Refaeli")),
    "russian": (S("Dmitri Anastasia Sergei Olga Alexei Natalia Ivan Ekaterina Mikhail Yulia Pavel Irina Andrei "
                  "Svetlana Nikolai Tatiana Artem Ksenia Maxim Daria Boris Vera"),
                S("Ivanov Smirnov Kuznetsov Popov Volkov Sokolov Lebedev Kozlov Novikov Morozov Petrov Pavlov "
                  "Fedorov Orlov Mikhailov Vasiliev Zaitsev Belov Gusev Titov")),
    "arab": (S("Ahmad Rania Omar Lina Yousef Nour Khaled Samar Tarek Hiba Fadi Maha Rami Dina Karim Salma Majd "
               "Aya Nasser Reem Hani Layla"),
             S("Haddad Khoury Nassar Mansour Saleh Awad Hamdan Darwish Jaber Qasem Suleiman Zoabi Masarwa "
               "Abu-Ghosh Bishara Khalil Odeh Farah Azar Shalabi")),
    "anglo": (S("James Emily Michael Sarah David Jessica Robert Ashley John Jennifer Matthew Amanda Christopher "
                "Megan Andrew Lauren Joshua Rachel Ryan Hannah Tyler Olivia Brandon Emma Kevin Grace Justin Chloe "
                "Nathan Abigail Benjamin Charlotte Samuel Sophie Thomas Katherine William Madison Daniel Alice "
                "George Harriet Oliver Jack Amelia Henry Lucy Ethan"),
              S("Smith Johnson Williams Brown Jones Miller Davis Wilson Anderson Taylor Thomas Moore Martin "
                "Jackson Thompson White Harris Clark Lewis Walker Hall Allen Young King Wright Scott Green Baker "
                "Adams Nelson Hill Campbell Mitchell Roberts Carter Phillips Evans Turner Parker Collins Edwards "
                "Stewart Morris Hughes Cooper Ward Bennett Wood")),
    "irish": (S("Siobhán Liam Aoife Seán Niamh Cian Ciara Darragh Saoirse Eoin Orla Conor Róisín Declan Clodagh "
                "Pádraig Méabh Oisín Aisling Ronan"),
              S("O'Brien O'Sullivan Murphy Kelly O'Connor Walsh Byrne Ryan O'Neill Doyle McCarthy Gallagher "
                "Kennedy Lynch Quinn Brennan Fitzgerald O'Reilly McLaughlin Nolan")),
    "hispanic": (S("José María Carlos Ana Luis Sofía Javier Lucía Miguel Valentina Diego Camila Andrés Isabel "
                   "Alejandro Gabriela Mateo Daniela Ricardo Paula Fernando Elena Raúl Marta Sebastián Adriana"),
                 S("García Rodríguez Martínez Hernández López González Pérez Sánchez Ramírez Torres Flores Rivera "
                   "Gómez Díaz Morales Ortiz Castillo Jiménez Ruiz Álvarez Romero Navarro Mendoza Vargas Castro "
                   "Ibáñez Muñoz Núñez")),
    "german": (S("Jürgen Anna Lukas Lena Felix Katharina Maximilian Sophie Jonas Leonie Tobias Julia Stefan "
                 "Sabine Matthias Franziska Florian Johanna Sebastian Birgit"),
               S("Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer "
                 "Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange "
                 "Köhler")),
    "french": (S("François Camille Julien Chloé Mathieu Élodie Nicolas Amélie Antoine Céline Pierre Manon Théo "
                 "Léa Hélène Guillaume Margaux Benoît Inès Rémi"),
               S("Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefèvre "
                 "Michel Garnier Faure Rousseau Blanc Guérin Chevalier Hénaff")),
    "polish": (S("Łukasz Agnieszka Piotr Katarzyna Tomasz Małgorzata Paweł Magdalena Michał Joanna Krzysztof "
                 "Aleksandra Marcin Ewa Jakub Monika Grzegorz Dorota Mateusz Barbara Wojciech Natalia Kamil Zofia "
                 "Bartosz Justyna Rafał Karolina Dawid Weronika Szymon Agata Adam Kinga Maciej Anna Przemysław "
                 "Iwona Jan Beata"),
               S("Nowak Kowalski Wiśniewski Wójcik Kowalczyk Kamiński Lewandowski Zieliński Szymański Woźniak "
                 "Dąbrowski Kozłowski Jankowski Mazur Kwiatkowski Krawczyk Piotrowski Grabowski Nowakowski "
                 "Pawłowski Michalski Nowicki Adamczyk Dudek Zając Wieczorek Jabłoński Król Majewski Olszewski "
                 "Jaworski Wróbel Malinowski Pawlak Witkowski Walczak Stępień Górski Rutkowski Michalak")),
    "ukrainian": (S("Oleksandr Olena Andriy Iryna Taras Oksana Bohdan Yuliia Serhiy Nataliya Volodymyr "
                    "Khrystyna Dmytro Halyna Yaroslav Sofiia"),
                  S("Shevchenko Kovalenko Bondarenko Tkachenko Kravchenko Oliynyk Shevchuk Melnyk Boyko Lysenko "
                    "Marchenko Rudenko Savchenko Petrenko Kovalchuk Tkachuk")),
    "indian": (S("Priya Rahul Ananya Arjun Kavya Vikram Sneha Rohan Divya Aditya Pooja Karthik Neha Siddharth "
                 "Lakshmi Varun Meera Suresh Anjali Nikhil Deepa Rajesh Shreya Harish Aishwarya Manoj Swati Pranav "
                 "Nandini Abhishek Ishaan Tanvi Venkat Radhika Gaurav Sanjana Amit Keerthi Srinivas Bhavana Arun "
                 "Revathi Vivek Lavanya Kiran Sunita Mohan Ritu"),
               S("Sharma Patel Reddy Iyer Nair Gupta Kumar Singh Rao Menon Krishnan Joshi Mehta Desai Chatterjee "
                 "Banerjee Mukherjee Pillai Srinivasan Venkatesh Agarwal Bhat Kulkarni Shetty Hegde Naidu Das "
                 "Ghosh Verma Mishra Chopra Kapoor Malhotra Subramanian Raghavan Goswami Pandey Saxena Trivedi "
                 "Ramesh Prasad Choudhary Sethi Bose Kamath Gowda")),
    "chinese": (S("Wei Jing Li Xin Hao Mei Jun Yan Chen Lin Ming Hui Tao Ying Lei Fang Kai Qing Yu Xiaoling"),
                S("Zhang Wang Li Liu Chen Yang Huang Zhao Wu Zhou Xu Sun Ma Zhu Hu Guo Lin He Gao Luo")),
    "african": (S("Chinedu Ngozi Kwame Amara Tunde Folake Oluwaseun Adaeze Kofi Abena Emeka Chiamaka Babajide "
                  "Yetunde Obinna Zainab Sipho Thandiwe Tendai Nnamdi"),
                S("Okafor Adeyemi Mensah Okonkwo Nwosu Balogun Boateng Eze Adebayo Owusu Nkosi Chukwu Oyelaran "
                  "Asante Obi Afolabi Danjuma Ndlovu Onyekachi Mbeki")),
    "italian": (S("Marco Giulia Alessandro Francesca Matteo Chiara Lorenzo Sara Davide Martina Andrea Elisa "
                  "Riccardo Federica Stefano Silvia"),
                S("Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti "
                  "De Luca Mancini Costa Giordano Rizzo Lombardi D'Angelo Moretti Barbieri")),
}
MALE_A = {"Nikita", "Kuba"}  # masculine names ending in "a" (for surname gendering)

LOC_CULTURE = {
    "Tel Aviv": dict(israeli=68, russian=12, arab=10, anglo=4, french=3, ukrainian=3),
    "NYC": dict(anglo=38, hispanic=15, indian=10, chinese=8, israeli=6, irish=6, italian=6, african=6,
                russian=3, german=2),
    "London": dict(anglo=42, irish=10, indian=13, african=10, french=6, italian=5, polish=5, german=4,
                   hispanic=3, chinese=2),
    "Kraków": dict(polish=80, ukrainian=12, german=3, anglo=2, indian=3),
    "Bangalore": dict(indian=96, anglo=2, chinese=2),
    "Remote": dict(anglo=18, hispanic=10, indian=12, israeli=12, polish=8, german=7, french=6, african=7,
                   irish=4, italian=6, chinese=5, ukrainian=5),
}

# (display name, email local part)
SPECIAL_NAMES = [
    ("Siobhán O'Brien", "siobhan.obrien"),
    ("José Álvarez-Ruiz", "jose.alvarez-ruiz"),
    ("Jürgen Müller-Lüdenscheidt", "jurgen.muller-ludenscheidt"),
    ("Zoë D'Angelo", "zoe.dangelo"),
    ("Łukasz Wróbel-Nowak", "lukasz.wrobel-nowak"),
    ("Ngozi Okonkwo-Adeyemi", "ngozi.okonkwo-adeyemi"),
    ("Mary-Jane O'Connor", "mary-jane.oconnor"),
    ("Björn Ångström", "bjorn.angstrom"),
    ("Carlos Mendoza, Jr.", "carlos.mendoza"),
    ("Anne-Marie van der Berg", "anne-marie.vanderberg"),
    ("Seán Ó Súilleabháin", "sean.osuilleabhain"),
    ("Aditya", "aditya"),
    ("יעל כהן", "yael.cohen.he"),
    ("王芳", "fang.wang"),
]
DUP_NAMES = ["David Cohen", "Priya Sharma", "Michael Smith", "Anna Nowak", "Wei Zhang", "María García",
             "Yossi Levi", "James Wilson", "Rahul Gupta", "Olga Ivanova", "Tomasz Kowalski", "Sarah Johnson"]

# --------------------------------------------------------------------------------------
# Roles: key -> (title bases, ladder, skills)
# --------------------------------------------------------------------------------------
LADDERS = {
    "eng": [("Principal {}", 1), ("Staff {}", 5), ("Senior {}", 32), ("{}", 45), ("Associate {}", 6)],
    "std": [("Senior {}", 28), ("{}", 57), ("Associate {}", 12)],
    "sen": [("Senior {}", 35), ("{}", 65)],
    "lead": [("Lead {}", 8), ("Senior {}", 35), ("{}", 57)],
    "plain": [("{}", 1)],
}
ROLES = {
    "swe_be": (["Software Engineer", "Backend Engineer"], "eng",
               "Go,Java,Kotlin,Python,PostgreSQL,Kafka,gRPC,Redis,Microservices,API Design,Distributed Systems"),
    "swe_fs": (["Software Engineer", "Full Stack Engineer"], "eng",
               "TypeScript,React,Node.js,Python,PostgreSQL,GraphQL,API Design,A/B Testing"),
    "swe_fe": (["Frontend Engineer", "Software Engineer"], "eng",
               "TypeScript,React,CSS,Accessibility,Web Performance,Design Systems,Storybook"),
    "sre": (["Site Reliability Engineer"], "eng",
            "Kubernetes,Terraform,AWS,Prometheus,Incident Response,Linux,Observability"),
    "devops": (["DevOps Engineer", "Build Engineer"], "eng", "CI/CD,GitHub Actions,Bazel,Docker,Kubernetes,Terraform"),
    "net": (["Network Engineer"], "eng", "BGP,VPC Networking,Load Balancing,CDN,Linux,DNS"),
    "ios": (["iOS Engineer"], "eng", "Swift,SwiftUI,Objective-C,Xcode,Mobile CI"),
    "android": (["Android Engineer"], "eng", "Kotlin,Jetpack Compose,Java,Gradle,Mobile CI"),
    "qa": (["QA Engineer", "Test Automation Engineer"], "eng",
           "Playwright,Selenium,Cypress,Test Automation,Load Testing,Python"),
    "sec": (["Security Engineer", "Application Security Engineer"], "eng",
            "Threat Modeling,Penetration Testing,SAST,Cloud Security,IAM,OWASP"),
    "arch": (["Software Architect"], "sen", "System Design,Distributed Systems,Domain-Driven Design,Cloud Architecture"),
    "de": (["Data Engineer"], "eng", "Spark,Airflow,dbt,Snowflake,Kafka,Python,SQL"),
    "analyst": (["Data Analyst", "BI Analyst"], "std", "SQL,Tableau,Looker,Python,Statistics,dbt"),
    "mle": (["Machine Learning Engineer"], "eng", "PyTorch,MLOps,Kubernetes,Python,Feature Stores,LLMs"),
    "ds": (["Data Scientist"], "eng", "Python,Statistics,Causal Inference,Forecasting,LLMs,Experimentation"),
    "gov": (["Data Governance Analyst"], "std", "Data Quality,GDPR,Data Catalog,SQL"),
    "it_support": (["IT Support Specialist", "IT Support Engineer"], "std",
                   "Jamf,Intune,Okta,Hardware,ServiceNow,Google Workspace"),
    "sysadmin": (["Systems Administrator", "IT Engineer"], "std", "Entra ID,Okta,Intune,PowerShell,Networking"),
    "soc": (["Security Analyst", "SOC Analyst"], "std", "SIEM,Splunk,Incident Response,Threat Hunting,EDR"),
    "grc": (["GRC Analyst", "Compliance Analyst"], "std", "SOC 2,ISO 27001,Risk Assessment,Vendor Risk,GDPR"),
    "pm": (["Product Manager"], "eng", "Roadmapping,Discovery,Analytics,A/B Testing,Pricing,Stakeholder Management"),
    "designer": (["Product Designer"], "lead", "Figma,Prototyping,Design Systems,Interaction Design,Accessibility"),
    "uxr": (["UX Researcher"], "sen", "Usability Testing,User Interviews,Survey Design,Synthesis"),
    "writer": (["Content Designer", "UX Writer"], "sen", "UX Writing,Localization,Content Strategy"),
    "prodops": (["Product Operations Specialist"], "sen", "Jira,Process Design,Release Management,OKRs"),
    "ae_ent": (["Enterprise Account Executive"], "sen", "Enterprise Sales,MEDDICC,Salesforce,Negotiation,Forecasting"),
    "ae": (["Account Executive"], "std", "Salesforce,Negotiation,Pipeline Management,Cold Outreach"),
    "sdr": (["Sales Development Representative", "Business Development Representative"], "sen",
            "Cold Outreach,Prospecting,Outreach.io,LinkedIn Sales Navigator,Salesforce"),
    "se": (["Solutions Engineer", "Sales Engineer"], "sen", "Demos,Technical Discovery,APIs,POCs,Integrations"),
    "partner": (["Partner Manager", "Alliances Manager"], "sen", "Channel Sales,Co-Selling,AWS Marketplace,Partner Enablement"),
    "salesops": (["Revenue Operations Analyst", "Sales Enablement Specialist"], "std",
                 "Salesforce,Gong,Forecasting,Territory Planning,CPQ"),
    "support": (["Support Specialist", "Customer Support Specialist"], "std",
                "Zendesk,Troubleshooting,Billing Support,Live Chat,German,Spanish,Polish,French,Hebrew"),
    "support_t2": (["Technical Support Engineer"], "std", "APIs,SQL,Log Analysis,Troubleshooting,Jira,Zendesk"),
    "csm": (["Customer Success Manager"], "sen", "Onboarding,Renewals,QBRs,Gainsight,Churn Reduction"),
    "supportops": (["Support Operations Analyst"], "std", "Zendesk Admin,Workforce Management,Reporting,Automation"),
    "kb": (["Knowledge Base Specialist", "Support Trainer"], "std", "Technical Writing,Training,Knowledge Management"),
    "bizops": (["Business Operations Analyst", "Strategy Analyst"], "std", "Excel,SQL,Business Cases,OKRs,Process Design"),
    "facilities": (["Workplace Coordinator", "Facilities Specialist"], "std",
                   "Office Management,Vendor Coordination,Health & Safety,Events"),
    "procurement": (["Procurement Specialist", "Buyer"], "std", "Coupa,Negotiation,Contract Management,Sourcing"),
    "pmo": (["Program Manager"], "sen", "Program Management,Jira,Risk Management,OKRs"),
    "vendor": (["Vendor Manager"], "sen", "Vendor Management,Contract Management,SLAs"),
    "pmm": (["Product Marketing Manager"], "sen", "Positioning,Messaging,Launches,Competitive Intelligence"),
    "mkt": (["Marketing Manager", "Digital Marketing Specialist", "Field Marketing Manager"], "sen",
            "SEO,SEM,Paid Social,HubSpot,Events,ABM"),
    "creative": (["Graphic Designer", "Brand Designer", "Video Producer"], "sen",
                 "Adobe Creative Suite,Figma,Motion Graphics,Brand Guidelines"),
    "content": (["Content Marketing Manager", "Communications Manager", "Copywriter"], "sen",
                "Copywriting,PR,Social Media,Editorial"),
    "mops": (["Marketing Operations Analyst"], "std", "HubSpot,Marketo,Salesforce,Attribution,Lead Scoring"),
    "fpa": (["Financial Analyst", "FP&A Analyst"], "std", "Financial Modeling,Excel,Budgeting,Forecasting,Anaplan"),
    "acct": (["Accountant", "Staff Accountant", "AP Specialist"], "std",
             "NetSuite,Reconciliations,Month-End Close,US GAAP,IFRS,Revenue Recognition"),
    "tax": (["Tax Analyst", "Tax Manager"], "sen", "Transfer Pricing,Indirect Tax,VAT,Tax Provision"),
    "treasury": (["Treasury Analyst"], "sen", "Cash Management,FX Hedging,Banking Relationships"),
    "payroll": (["Payroll Specialist"], "std", "Payroll,ADP,Hibob,Compliance"),
    "recruiter": (["Recruiter", "Technical Recruiter", "Sourcer"], "sen",
                  "Sourcing,Greenhouse,Interviewing,Employer Branding,Technical Recruiting"),
    "hrbp": (["HR Business Partner"], "sen", "Employee Relations,Performance Management,Org Design,Coaching"),
    "rewards": (["Compensation Analyst", "Benefits Specialist"], "std", "Compensation,Benefits,Equity,Pave"),
    "peopleops": (["People Operations Specialist", "HRIS Analyst"], "std", "Hibob,Workday,Onboarding,HR Compliance"),
    "ld": (["Learning & Development Specialist"], "sen", "Training Design,Leadership Development,LMS"),
    "counsel_comm": (["Commercial Counsel"], "sen", "Contract Negotiation,SaaS Agreements,Procurement Law"),
    "privacy": (["Privacy Counsel", "Compliance Manager"], "sen", "GDPR,CCPA,Privacy Program,DPAs"),
    "counsel_emp": (["Employment Counsel"], "plain", "Employment Law,Immigration,Policies"),
    "counsel_corp": (["Corporate Counsel"], "plain", "Corporate Governance,IP,Trademarks,M&A"),
    "paralegal": (["Paralegal", "Legal Operations Specialist"], "plain", "Contract Management,Ironclad,Legal Ops"),
}
ROLES = {k: (b, lad, v.split(",")) for k, (b, lad, v) in ROLES.items()}

STYLES = {  # team = (min,max) ICs per first-line lead
    "eng": dict(team=(4, 9), split="Squad", contractor=0.06, intern=0.03,
                staff=["Principal Engineer", "Technical Program Manager", "Senior Technical Program Manager"],
                staff_skills=["System Design", "Program Management", "Roadmapping", "Architecture Reviews"]),
    "sales": dict(team=(5, 10), split="Pod", contractor=0.02, intern=0.0,
                  staff=["Deal Desk Analyst", "Sales Strategy Manager", "Revenue Analyst"],
                  staff_skills=["Forecasting", "Salesforce", "Deal Strategy"]),
    "support": dict(team=(15, 25), split="Shift", contractor=0.12, intern=0.0,
                    staff=["Workforce Planning Analyst", "Support Quality Analyst", "Escalations Specialist"],
                    staff_skills=["Workforce Management", "QA Scorecards", "Escalations"]),
    "default": dict(team=(3, 8), split="Team", contractor=0.03, intern=0.0,
                    staff=["Program Manager", "Business Analyst", "Senior Program Manager"],
                    staff_skills=["Program Management", "OKRs", "Stakeholder Management"]),
}
STYLES["mkt"] = dict(STYLES["default"], intern=0.03)
STYLES["data"] = dict(STYLES["eng"], team=(3, 8))

LOCS = ["Tel Aviv", "NYC", "London", "Remote", "Kraków", "Bangalore"]
LOC_W = {
    "eng": dict(zip(LOCS, [40, 8, 5, 15, 20, 12])),
    "sales": dict(zip(LOCS, [10, 35, 25, 25, 0, 5])),
    "support": dict(zip(LOCS, [10, 5, 5, 15, 35, 30])),
    "default": dict(zip(LOCS, [38, 25, 15, 14, 5, 3])),
    "exec": {"Tel Aviv": 60, "NYC": 35, "London": 5},
    "NA": {"NYC": 70, "Remote": 30}, "EMEA": {"London": 55, "Tel Aviv": 15, "Kraków": 15, "Remote": 15},
    "APAC": {"Bangalore": 85, "Remote": 15},
}


def N(name, w=1, kids=None, **kw):
    d = dict(name=name, w=w, kids=kids or [])
    d.update(kw)
    return d


def sites(role):
    return [N(f"Workplace {l}", w, role=role, loc={l: 1}) for l, w in
            [("Tel Aviv", 35), ("NYC", 25), ("London", 15), ("Kraków", 15), ("Bangalore", 10)]]


ENGINEERING = N("Engineering", kids=[
    N("Platform", 30, [
        N("Infrastructure", 45, [N("SRE", 40, role="sre"), N("Cloud Platform", 35, role="swe_be"),
                                 N("Networking", 12, role="net"), N("Storage", 13, role="swe_be")]),
        N("Developer Experience", 25, [N("Build & CI", 50, role="devops"), N("Internal Tools", 50, role="swe_fs")]),
        N("Core Services", 30, [N("Identity & Access", 35), N("Messaging", 30), N("Search", 35)], role="swe_be"),
    ]),
    N("Product Engineering", 42, [
        N("Payments", 25, [N("Checkout", 50), N("Billing", 50)]),
        N("Growth", 18, [N("Onboarding", 50), N("Experimentation", 50)]),
        N("Marketplace", 30, [N("Listings", 40), N("Pricing", 30), N("Fulfillment", 30)]),
        N("Web Frontend", 27, [N("Design Systems", 40), N("Web App", 60)], role="swe_fe"),
    ], role="swe_fs"),
    N("Mobile", 12, [N("iOS", 50, role="ios"), N("Android", 50, role="android")]),
    N("Quality Engineering", 9, role="qa"),
    N("Security Engineering", 5, [N("Application Security", 60), N("Cloud Security", 40)], role="sec"),
    N("Architecture", 2, role="arch"),
], style="eng", loc=LOC_W["eng"], cc=10)
DATA = N("Data", kids=[
    N("Data Engineering", 35, role="de"),
    N("Analytics", 30, [N("Product Analytics", 50), N("Business Intelligence", 50)], role="analyst"),
    N("Data Science", 25, [N("ML Platform", 40, role="mle"), N("Applied Science", 60, role="ds")]),
    N("Data Governance", 10, role="gov"),
], style="data", loc=LOC_W["eng"], cc=11)
ITSEC = N("IT & Security", kids=[
    N("IT Helpdesk", 40, role="it_support", team=(6, 14)), N("Corporate IT", 25, role="sysadmin"),
    N("Security Operations", 25, role="soc"), N("GRC", 10, role="grc"),
], style="default", loc=LOC_W["default"], cc=12, head_title={VP: "Chief Information Security Officer"})
PRODUCT = N("Product", kids=[
    N("Product Management", 55, [N("Platform Products", 30), N("Commerce Products", 40), N("Growth Products", 30)],
      role="pm"),
    N("Design", 35, [N("Product Design", 65, role="designer"), N("UX Research", 20, role="uxr"),
                     N("Content Design", 15, role="writer")]),
    N("Product Operations", 10, role="prodops"),
], style="mkt", loc=LOC_W["default"], cc=20)
SALES = N("Sales", kids=[
    N("Enterprise Sales", 30, [N("Enterprise North America", 45, loc=LOC_W["NA"]),
                               N("Enterprise EMEA", 40, loc=LOC_W["EMEA"]),
                               N("Enterprise APAC", 15, loc=LOC_W["APAC"])], role="ae_ent"),
    N("Commercial Sales", 25, [N("Mid-Market", 55), N("SMB", 45)], role="ae"),
    N("Sales Development", 20, [N("Inbound SDR", 50), N("Outbound SDR", 50)], role="sdr"),
    N("Solutions Engineering", 12, role="se"),
    N("Partnerships & Alliances", 6, role="partner"),
    N("Sales Operations", 7, [N("Revenue Operations", 60), N("Sales Enablement", 40)], role="salesops"),
], style="sales", loc=LOC_W["sales"], cc=30)
SUPPORT = N("Customer Support", kids=[
    N("Tier 1 Support", 60, [N("Tier 1 EMEA", 40, loc={"Kraków": 70, "London": 15, "Remote": 15}),
                             N("Tier 1 North America", 35, loc=LOC_W["NA"]),
                             N("Tier 1 APAC", 25, loc=LOC_W["APAC"])], role="support"),
    N("Tier 2 Technical Support", 22, role="support_t2", team=(10, 18)),
    N("Customer Success", 10, role="csm", team=(5, 10)),
    N("Support Operations", 4, role="supportops", team=(3, 6)),
    N("Knowledge & Training", 4, role="kb", team=(3, 6)),
], style="support", loc=LOC_W["support"], cc=40)
OPERATIONS = N("Operations", kids=[
    N("Business Operations", 25, role="bizops"),
    N("Workplace & Facilities", 30, sites("facilities")),
    N("Procurement", 15, role="procurement"),
    N("Program Management Office", 15, role="pmo"),
    N("Vendor Management", 15, role="vendor"),
], style="default", loc=LOC_W["default"], cc=50)
MARKETING = N("Marketing", kids=[
    N("Product Marketing", 22, role="pmm"),
    N("Demand Generation", 25, [N("Digital Marketing", 50), N("Field Marketing", 30), N("Events", 20)], role="mkt"),
    N("Brand & Creative", 20, [N("Brand", 40), N("Creative Studio", 60)], role="creative"),
    N("Content & Communications", 18, [N("Content", 60), N("PR & Communications", 40)], role="content"),
    N("Marketing Operations", 15, role="mops"),
], style="mkt", loc=LOC_W["default"], cc=60)
FINANCE = N("Finance", kids=[
    N("FP&A", 25, role="fpa"),
    N("Accounting", 40, [N("General Ledger", 40), N("Accounts Payable", 30), N("Revenue Accounting", 30)],
      role="acct", head_title={DIR: "Corporate Controller", VP: "VP, Corporate Controller"}),
    N("Tax", 10, role="tax"), N("Treasury", 8, role="treasury"), N("Payroll", 17, role="payroll"),
], style="default", loc=LOC_W["default"], cc=70)
HR = N("Human Resources", kids=[
    N("Talent Acquisition", 40, [N("Technical Recruiting", 60), N("G&A Recruiting", 40)], role="recruiter"),
    N("HR Business Partners", 25, role="hrbp"),
    N("Total Rewards", 12, role="rewards"),
    N("People Operations", 15, role="peopleops"),
    N("Learning & Development", 8, role="ld"),
], style="default", loc=LOC_W["default"], cc=80)
LEGAL = N("Legal", kids=[
    N("Commercial Legal", 45, role=[("counsel_comm", 70), ("paralegal", 30)]),
    N("Privacy & Compliance", 25, role="privacy"),
    N("Employment Legal", 15, role="counsel_emp"),
    N("Corporate & IP", 15, role="counsel_corp"),
], style="default", loc={"Tel Aviv": 50, "NYC": 40, "London": 10}, cc=90, team=(8, 14))

SHARES = [(ENGINEERING, 40), (SALES, 15), (SUPPORT, 12), (OPERATIONS, 6), (MARKETING, 6), (PRODUCT, 5),
          (DATA, 5), (ITSEC, 4), (FINANCE, 4), (HR, 3)]
# (title, abbrev, depts led, leads directly?, has EA)
EXECS = [
    ("Chief Technology Officer", "CTO", [ENGINEERING, DATA, ITSEC], False, True),
    ("Chief Product Officer", "CPO", [PRODUCT], True, False),
    ("Chief Revenue Officer", "CRO", [SALES], True, True),
    ("Chief Operating Officer", "COO", [OPERATIONS, SUPPORT], False, True),
    ("Chief Marketing Officer", "CMO", [MARKETING], True, False),
    ("Chief Financial Officer", "CFO", [FINANCE], True, False),
    ("Chief Human Resources Officer", "CHRO", [HR], True, False),
    ("General Counsel", "GC", [LEGAL], True, False),
]
FIXED_OVERHEAD = 1 + 1 + 1 + len(EXECS) + sum(e[4] for e in EXECS) + 1  # CEO, EA, CoS, C-suite, EAs, advisor

MGR_WORD = {"Engineering": "Engineering Manager", "Sales": "Sales Manager", "Customer Support": "Support Manager"}


def size_rank(hc):
    for th, r in ((600, SVP), (80, VP), (30, DIR), (14, SRM), (5, MGR)):
        if hc >= th:
            return r
    return TL


def mgr_title(rank, area, dept, node=None):
    if node and rank in node.get("head_title", {}):
        return node["head_title"][rank]
    if rank == SVP:
        return f"SVP, {area}"
    if rank == VP:
        return f"VP, {area}"
    if rank == DIR:
        return f"Director of Engineering, {area}" if dept == "Engineering" else f"Director, {area}"
    if rank == SRM:
        return f"Senior Engineering Manager, {area}" if dept == "Engineering" else f"Senior Manager, {area}"
    if rank == MGR:
        return f"{MGR_WORD.get(dept, 'Manager')}, {area}"
    return f"Team Lead, {area}"


def lr_alloc(total, weights):
    """Largest-remainder integer allocation of `total` by `weights`."""
    s = sum(weights)
    raw = [total * w / s for w in weights]
    out = [int(x) for x in raw]
    order = sorted(range(len(weights)), key=lambda i: -(raw[i] - out[i]))
    for i in order[: total - sum(out)]:
        out[i] += 1
    return out


def fold_ascii(s):
    s = s.translate(str.maketrans({"ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "æ": "ae", "ß": "ss", "đ": "d"}))
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def email_local(first, last):
    f = re.sub(r"[^a-z0-9-]", "", fold_ascii(first).lower())
    l = re.sub(r"[^a-z0-9-]", "", fold_ascii(last).lower())
    return f"{f}.{l}" if l else f


# --------------------------------------------------------------------------------------
# Generator
# --------------------------------------------------------------------------------------
class Gen:
    def __init__(self, n, seed):
        self.n, self.rng = n, random.Random(seed)
        self.people = []
        self.cos_done = set()

    def wchoice(self, d):
        keys = list(d.keys())
        return self.rng.choices(keys, weights=[d[k] for k in keys])[0]

    def add(self, mgr, rank, title, ctx, team=None, loc=None, skills=None, etype="FTE", **kw):
        p = dict(idx=len(self.people), mgr=mgr, rank=rank, title=title, dept=ctx["dept"],
                 team=team or ctx["path"][-1], path=" > ".join(ctx["path"] if team is None or team == ctx["path"][-1]
                                                                else ctx["path"] + [team]),
                 loc=loc or self.wchoice(ctx["loc"]), etype=etype, cc=ctx["cc"], skills=skills or [],
                 flags=set(), style=ctx["style"])
        p.update(kw)
        self.people.append(p)
        return p["idx"]

    def pick_skills(self, pool, k=None):
        k = self.rng.choices([0, 1, 2, 3], weights=[18, 30, 32, 20])[0] if k is None else k
        return self.rng.sample(pool, min(k, len(pool)))

    def derive(self, ctx, node):
        c = dict(ctx)
        if node.get("style"):
            c["style"] = node["style"]
        if node.get("loc"):
            c["loc"] = node["loc"]
        if node.get("role"):
            r = node["role"]
            c["roles"] = [(r, 1)] if isinstance(r, str) else r
        if node.get("team"):
            c["team"] = node["team"]
        else:
            c["team"] = STYLES[c["style"]]["team"]
        c["path"] = ctx["path"] + [node["name"]] if ctx["path"] and ctx["path"][-1] != node["name"] else [node["name"]]
        return c

    def leaf_roles(self, node, ctx):
        """Collapsed subtree -> weighted role mix of its leaves."""
        c = self.derive(ctx, node)
        if not node["kids"]:
            return c["roles"]
        tot = sum(k["w"] for k in node["kids"])
        out = []
        for k in node["kids"]:
            for r, w in self.leaf_roles(k, c):
                out.append((r, w * k["w"] / tot))
        return out

    def make_ic(self, mgr, ctx, loc):
        st = STYLES[ctx["style"]]
        role = self.rng.choices([r for r, _ in ctx["roles"]], weights=[w for _, w in ctx["roles"]])[0]
        bases, lad, skills = ROLES[role]
        base = self.rng.choice(bases)
        etype = "FTE"
        if self.rng.random() < st["intern"]:
            etype, title = "Intern", f"{base} Intern"
        else:
            fmt = self.rng.choices([f for f, _ in LADDERS[lad]], weights=[w for _, w in LADDERS[lad]])[0]
            title = fmt.format(base)
            if self.rng.random() < st["contractor"]:
                etype = "Contractor"
        return self.add(mgr, IC, title, ctx, loc=loc, skills=self.pick_skills(skills), etype=etype)

    def build(self, node, parent, prank, hc, ctx, lead_by_parent=False):
        ctx = self.derive(ctx, node)
        if lead_by_parent:
            leader, lrank = parent, prank
        else:
            if hc <= 0:
                return
            if hc == 1:  # lone IC reports directly to parent's leader
                self.make_ic(parent, ctx, None)
                return
            splits = bool(node["kids"]) and hc >= max(8, 5 * len(node["kids"]))
            if splits:
                lrank = min(max(prank + 1, size_rank(hc)), MGR if prank + 1 <= MGR else TL)
            else:
                lrank = self.leaf_rank(prank, hc - 1, ctx)
            leader = self.add(parent, lrank, mgr_title(lrank, node["name"], ctx["dept"], node), ctx,
                              loc=self.wchoice(ctx["loc"]),
                              skills=self.pick_skills(self.pool(ctx), self.rng.choice([0, 1, 1, 2])))
            hc -= 1
        splits = bool(node["kids"]) and hc >= max(8, 5 * len(node["kids"]))
        if splits:
            if lrank <= DIR and hc > 12 and self.rng.random() < 0.5:
                hc -= self.add_staff(leader, lrank, ctx)
            weights = [k["w"] * self.rng.uniform(0.75, 1.25) for k in node["kids"]]
            for k, a in zip(node["kids"], lr_alloc(hc, weights)):
                self.build(k, leader, lrank, a, ctx)
        else:
            ctx = dict(ctx, roles=self.leaf_roles(node, dict(ctx, path=ctx["path"][:-1])))
            self.fill_leaf(leader, lrank, hc, ctx, node["name"])

    def leaf_rank(self, prank, members, ctx):
        cap = ctx["team"][1]
        if members > cap:  # will be split into squads
            r = max(prank + 1, min(size_rank(members + 1), MGR))
        elif ctx["style"] == "support" and ctx["team"][1] >= 15:
            r = max(prank + 1, TL)
        else:
            r = max(prank + 1, MGR if members >= 5 else TL)
        return min(r, TL)

    def pool(self, ctx):
        out = []
        for r, _ in ctx["roles"]:
            out += [s for s in ROLES[r][2] if s not in out]
        return out

    def add_staff(self, leader, lrank, ctx):
        st = STYLES[ctx["style"]]
        n = 0
        dept = ctx["dept"]
        if lrank <= VP and dept not in self.cos_done and self.rng.random() < 0.5:
            self.cos_done.add(dept)
            self.add(leader, IC, f"Chief of Staff, {dept}", ctx, loc=self.people[leader]["loc"],
                     skills=self.pick_skills(st["staff_skills"]))
            n += 1
        for _ in range(self.rng.randint(1, 2)):
            self.add(leader, IC, self.rng.choice(st["staff"]), ctx, skills=self.pick_skills(st["staff_skills"]))
            n += 1
        return n

    def fill_leaf(self, leader, lrank, hc, ctx, team, final=False):
        """Leaf team: ICs directly under leader, or split into squads (each squad = TL + ICs, never re-split).
        Very large leaves get one intermediate 'Group' layer of managers first."""
        if hc <= 0:
            return
        lo, hi = ctx["team"]
        cap = self.rng.randint(lo, hi)
        if final or hc <= cap:
            primary = self.wchoice(ctx["loc"])
            tctx = dict(ctx, path=ctx["path"] if ctx["path"][-1] == team else ctx["path"] + [team])
            for _ in range(hc):
                loc = primary if self.rng.random() < 0.78 else self.wchoice(ctx["loc"])
                self.make_ic(leader, tctx, loc)
            return
        avg = (lo + hi) / 2
        k = max(2, round(hc / (avg + 1)))
        word = STYLES[ctx["style"]]["split"]
        if k > 9 and not final:  # intermediate groups, each then split into squads
            g = math.ceil(k / 6)
            parts = lr_alloc(hc, [self.rng.uniform(0.8, 1.2) for _ in range(g)])
            r = min(lrank + 1, MGR) if lrank < MGR else TL
            for i, part in enumerate(parts):
                name = f"{team} Group {i + 1}"
                gctx = dict(ctx, path=ctx["path"] + [name])
                m = self.add(leader, r, mgr_title(r, name, ctx["dept"]), gctx)
                self.fill_leaf(m, r, part - 1, gctx, name, final=(r == TL))
            return
        parts = lr_alloc(hc, [self.rng.uniform(0.7, 1.3) for _ in range(k)])
        for i, part in enumerate(parts):
            name = f"{team} {word} {chr(65 + i)}"
            sctx = dict(ctx, path=ctx["path"] + [name])
            tl = self.add(leader, TL, mgr_title(TL, name, ctx["dept"]), sctx,
                          skills=self.pick_skills(self.pool(ctx), self.rng.choice([0, 1, 2])))
            self.fill_leaf(tl, TL, part - 1, sctx, name, final=True)

    # ----------------------------------------------------------------------------------
    def generate(self):
        rng = self.rng
        exec_ctx = dict(dept="Executive Office", path=["Executive Office"], loc=LOC_W["exec"], cc=1,
                        style="default", roles=[("bizops", 1)], team=(3, 8))
        ceo = self.add(None, C, "Chief Executive Officer", exec_ctx, team="Office of the CEO", loc="Tel Aviv",
                       skills=["Strategy", "Fundraising"])
        self.add(ceo, IC, "Executive Assistant to the CEO", exec_ctx, team="Office of the CEO", loc="Tel Aviv")
        self.add(ceo, IC, "Chief of Staff to the CEO", exec_ctx, team="Office of the CEO", loc="Tel Aviv",
                 skills=["Strategy", "OKRs", "Board Relations"])

        remaining = self.n - FIXED_OVERHEAD
        legal = max(3, round(self.n * 0.004))
        allocs = dict(zip([d["name"] for d, _ in SHARES],
                          lr_alloc(remaining - legal, [w for _, w in SHARES])))
        allocs["Legal"] = legal

        for title, abbr, depts, direct, ea in EXECS:
            d0 = depts[0]
            ectx = dict(dept=d0["name"], path=[d0["name"]], loc=LOC_W["exec"], cc=d0["cc"],
                        style=d0["style"], roles=[("bizops", 1)], team=(3, 8))
            cx = self.add(ceo, C, title, ectx, skills=self.pick_skills(["Leadership", "Strategy", "M&A",
                                                                        "Board Relations", "Org Design"], 2))
            if ea:
                self.add(cx, IC, f"Executive Assistant to the {abbr}", exec_ctx, team=f"Office of the {abbr}",
                         loc=self.people[cx]["loc"])
            for d in depts:
                base = dict(dept=d["name"], path=[], loc=d["loc"], cc=d["cc"], style=d["style"],
                            roles=[("bizops", 1)], team=(3, 8))
                self.build(d, cx, C, allocs[d["name"]], base, lead_by_parent=direct)

        # orphan #1: advisor with no manager
        adv = self.add(None, IC, "Strategic Advisor", exec_ctx, team="Office of the CEO", loc="Remote",
                       etype="Contractor", skills=["Go-to-Market", "Board Relations"])
        self.people[adv]["flags"].add("orphan")
        assert len(self.people) == self.n, (len(self.people), self.n)

        # cost centers: dept code + index of first-level group
        firsts = {}
        for p in self.people:
            parts = p["path"].split(" > ")
            g = parts[1] if len(parts) > 1 else ""
            key = (p["dept"], g)
            if g and key not in firsts:
                firsts[key] = sum(1 for k in firsts if k[0] == p["dept"]) + 1
            p["cc"] = f"CC-{p['cc']:02d}{firsts.get(key, 0):02d}"

        self.assign_dates()
        self.edge_cases()
        self.assign_names()
        self.assign_ids()
        return self.people

    def assign_dates(self):
        rng = self.rng
        years = list(range(2012, 2027))
        w = [1.3 ** (y - 2012) for y in years]
        w[-1] *= 0.7  # 2026 is partial
        draws = {C: 3, SVP: 3, VP: 2, DIR: 2, SRM: 2, MGR: 1, TL: 1, IC: 1}

        def one():
            y = rng.choices(years, weights=w)[0]
            end = date(2026, 9, 15) if y == 2026 else date(y, 12, 31)
            start = date(2012, 2, 1) if y == 2012 else date(y, 1, 1)
            return start + timedelta(days=rng.randint(0, (end - start).days))

        for p in self.people:
            if p["etype"] == "Intern":
                p["start"] = date(2026, 6, 1) + timedelta(days=rng.randint(0, 45))
            else:
                p["start"] = min(one() for _ in range(draws[p["rank"]]))
        self.people[0]["start"] = date(2012, 2, 1)

    def edge_cases(self):
        rng, P = self.rng, self.people
        big = self.n >= 1000

        def ics(dept, etype="FTE"):
            return [p for p in P if p["dept"] == dept and p["rank"] == IC and p["etype"] == etype and not p["flags"]
                    and not p["title"].startswith(("Chief of Staff", "Executive Assistant"))]

        # vacancies
        reports = {}
        for p in P:
            reports.setdefault(p["mgr"], []).append(p["idx"])
        vac_depts = ["Engineering", "Customer Support"] if big else ["Engineering"]
        for d in vac_depts:
            cands = [p for p in P if p["dept"] == d and p["rank"] in (MGR, TL) and len(reports.get(p["idx"], [])) >= 3]
            v = rng.choice(cands)
            v.update(etype="Vacancy", skills=[], start=None)
            v["title"] += " (Open Req)"
            v["flags"].add("vacancy")
        # orphan #2: sales AE with no manager (pending assignment)
        o = rng.choice(ics("Sales"))
        o["mgr"] = None
        o["flags"].add("orphan")
        # dangling manager reference
        dgl = rng.choice(ics("Customer Support"))
        dgl["flags"].add("dangling")

    def assign_names(self):
        rng, P = self.rng, self.people
        used = set(DUP_NAMES) | {d for d, _ in SPECIAL_NAMES}
        for p in P:
            p["name"] = self.gen_name(p["loc"], used)
        eligible = [p for p in P if p["rank"] >= MGR and not p["flags"]]
        rng.shuffle(eligible)
        # special-character names
        for disp, local in SPECIAL_NAMES:
            p = eligible.pop()
            p["name"], p["email_local"] = disp, local
            p["flags"].add("special_name")
        # duplicate names (different people, different depts)
        ndup = 10 if self.n >= 1000 else 4
        for i, nm in enumerate(DUP_NAMES[:ndup]):
            copies = 3 if (i == 0 and self.n >= 1000) else 2
            chosen = []
            for p in list(eligible):
                if len(chosen) == copies:
                    break
                if all(p["dept"] != c["dept"] for c in chosen):
                    chosen.append(p)
                    eligible.remove(p)
            for p in chosen:
                p["name"] = nm
                p["flags"].add("dup_name")
        for p in P:
            if "vacancy" in p["flags"]:
                p["name"] = f"Vacant (REQ-{rng.randint(1000, 9999)})"

    def gen_name(self, loc, used):
        rng = self.rng
        cw = LOC_CULTURE[loc]
        for attempt in range(200):
            cult = self.wchoice(cw) if attempt < 40 else self.wchoice(LOC_CULTURE["Remote"])
            firsts, lasts = CULTURES[cult]
            f, l = rng.choice(firsts), rng.choice(lasts)
            fem = f.endswith("a") and f not in MALE_A
            if cult == "polish" and fem:
                l = re.sub(r"(ski|cki|dzki)$", lambda m: m.group(1)[:-1] + "a", l)
            if cult == "russian" and fem and re.search(r"(ov|ev|in)$", l):
                l += "a"
            if cult in ("hispanic", "anglo") and rng.random() < 0.03:
                l = f"{l}-{rng.choice(lasts)}"
            name = f"{f} {l}"
            if name not in used:
                used.add(name)
                return name
        raise RuntimeError("name pool exhausted")

    def assign_ids(self):
        rng, P = self.rng, self.people
        real = [p for p in P if "vacancy" not in p["flags"]]
        real.sort(key=lambda p: (p["idx"] != 0, p["start"], rng.random()))
        num, gaps = 0, []
        for p in real + [p for p in P if "vacancy" in p["flags"]]:
            step = 1 if rng.random() < 0.85 or num == 0 else rng.randint(2, 4)
            gaps += list(range(num + 1, num + step))
            num += step
            p["num"] = num
        by_idx = {p["idx"]: p for p in P}
        for p in P:
            p["ID"] = f"E{p['num']:06d}"
        for p in P:
            if "dangling" in p["flags"]:
                p["Manager"] = f"E{gaps[len(gaps) // 2]:06d}" if gaps else f"E{num + 7:06d}"
            else:
                p["Manager"] = by_idx[p["mgr"]]["ID"] if p["mgr"] is not None else ""
        seen = {}
        for p in sorted(P, key=lambda p: p["num"]):
            if "vacancy" in p["flags"]:
                p["Email"] = ""
                continue
            local = p.get("email_local")
            if not local:
                parts = p["name"].split(" ", 1)
                local = email_local(parts[0], parts[1] if len(parts) > 1 else "")
            seen[local] = seen.get(local, 0) + 1
            p["Email"] = f"{local}{seen[local] if seen[local] > 1 else ''}@{DOMAIN}"


COLUMNS = ["ID", "Name", "Title", "Manager", "Division", "Subtopics", "TeamName", "OrgPath", "Location", "Email",
           "EmploymentType", "StartDate", "CostCenter"]


def write_csv(people, path, lowercase_ids=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    fix = (lambda s: s.lower()) if lowercase_ids else (lambda s: s)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for p in sorted(people, key=lambda p: p["num"]):
            w.writerow([fix(p["ID"]), p["name"], p["title"], fix(p["Manager"]), p["dept"], ", ".join(p["skills"]),
                        p["team"], p["path"], p["loc"], p["Email"], p["etype"],
                        p["start"].isoformat() if p["start"] else "", p["cc"]])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("-n", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("-o", "--out", type=Path)
    ap.add_argument("--all", action="store_true", help="write samples/org_{200,2000,5000}.csv")
    ap.add_argument("--lowercase-ids", action="store_true",
                    help="emit e000123-style IDs (works around case-sensitive extId lookup in massImportEmployees)")
    a = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    jobs = [(n, root / "samples" / f"org_{n}.csv") for n in (200, 2000, 5000)] if a.all else \
        [(a.n, a.out or root / "samples" / f"org_{a.n}.csv")]
    for n, out in jobs:
        people = Gen(n, a.seed + n).generate()
        write_csv(people, out, a.lowercase_ids)
        print(f"wrote {out} ({len(people)} rows)")


if __name__ == "__main__":
    main()
