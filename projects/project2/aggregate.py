# Turns the open data of the city of Zürich into the three small files that the sketch loads:
#
#   cells.csv     one row per 250 m square, with the number of reports of every category
#   years.csv     the same numbers once more, but separately for every year
#   borders.csv   the borders of the city and of its 34 quarters, as short straight lines
#
# Run it from this folder:   python3 aggregate.py
#
# It needs two files from Stadt Zürich Open Data (data.stadt-zuerich.ch) next to it.
# They are not part of the repository because they are big:
#
#   stzh.zwn_meldungen_p.csv   dataset "Züri wie neu", one row per report (58 MB)
#   quartiere.json             dataset "Statistische Quartiere" as GeoJSON in Swiss coordinates:
#                              https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Statistische_Quartiere?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=adm_statistische_quartiere_map&srsName=EPSG:2056

import csv
import json
import math
import re
from collections import Counter, defaultdict

REPORTS = "stzh.zwn_meldungen_p.csv"
QUARTERS = "quartiere.json"
CELLS = "cells.csv"
YEARS = "years.csv"
BORDERS = "borders.csv"

CELL = 250          # size of one square in metres
MIN_MENTIONS = 3    # a street name must appear in this many reports of a square
TOLERANCE = 8       # a border may be moved by this many metres to need fewer points

# words that look like a street or a square, for example "Langstrasse" or "Limmatplatz"
STREET = re.compile(r"\b[A-ZÄÖÜ][a-zäöüé]+(?:-[A-ZÄÖÜ][a-zäöüé]+)*(?:strasse|platz|gasse|quai|brücke|anlage|allee)\b")

# everyday words that end like a street name but are not one
NOT_A_STREET = re.compile(r"(spielplatz|parkplatz|sportplatz|übungsplatz|Kehrplatz|Grillplatz|Rastplatz|Basketballplatz|"
                          r"Parkanlage|Sportanlage|Hafenanlage|Hängebrücke|Einbahnstrasse)$", re.IGNORECASE)

csv.field_size_limit(10**9)


# ---------------------------------------------------------------- the quarters

# quarters[name] = list of (e, n) points around the quarter, in Swiss LV95 metres
quarters = {}
with open(QUARTERS, encoding="utf-8") as file:
    for feature in json.load(file)["features"]:
        name = feature["properties"]["qname"]
        outline = feature["geometry"]["coordinates"][0]
        quarters[name] = [(round(e, 1), round(n, 1)) for e, n in outline]


def is_inside(e, n, outline):
    # count how many edges of the outline lie to the right of the point: an odd number means inside
    inside = False
    for (e1, n1), (e2, n2) in zip(outline, outline[1:]):
        if (n1 > n) != (n2 > n) and e < e1 + (n - n1) / (n2 - n1) * (e2 - e1):
            inside = not inside
    return inside


def quarter_at(e, n):
    for name, outline in quarters.items():
        if is_inside(e, n, outline):
            return name
    return ""


# ---------------------------------------------------------------- cells.csv

counts = defaultdict(Counter)        # counts[(e, n)][category] = number of reports
yearly = defaultdict(Counter)        # yearly[(e, n, year)][category] = number of reports in that year
streets = defaultdict(Counter)       # streets[(e, n)][street name] = number of reports
total_per_category = Counter()

with open(REPORTS, encoding="utf-8-sig", newline="") as file:
    for row in csv.DictReader(file):
        # the coordinates are Swiss LV95 metres, round them down to the corner of their square
        e = int(float(row["e"])) // CELL * CELL
        n = int(float(row["n"])) // CELL * CELL
        category = row["service_name"]

        year = int(row["requested_datetime"][:4])

        counts[(e, n)][category] += 1
        yearly[(e, n, year)][category] += 1
        total_per_category[category] += 1

        # count every street name only once per report
        # (sorted, so that two streets with the same count always come out in the same order)
        for street in sorted(set(STREET.findall(row["detail"]))):
            if not NOT_A_STREET.search(street):
                streets[(e, n)][street] += 1

# the biggest category comes first
categories = [name for name, count in total_per_category.most_common()]

with open(CELLS, "w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file, lineterminator="\n")
    writer.writerow(["e", "n", "quarter", "place"] + categories)

    for (e, n) in sorted(counts):
        # the quarter that the middle of the square lies in (empty outside the city)
        quarter = quarter_at(e + CELL / 2, n + CELL / 2)

        # the street that the reports of this square mention most often, if any
        place = ""
        if streets[(e, n)]:
            name, mentions = streets[(e, n)].most_common(1)[0]
            if mentions >= MIN_MENTIONS:
                place = name

        writer.writerow([e, n, quarter, place] + [counts[(e, n)][c] for c in categories])

print(len(counts), "squares,", sum(total_per_category.values()), "reports ->", CELLS)

with open(YEARS, "w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file, lineterminator="\n")
    writer.writerow(["e", "n", "year"] + categories)

    for (e, n, year) in sorted(yearly):
        writer.writerow([e, n, year] + [yearly[(e, n, year)][c] for c in categories])

print(len(yearly), "rows ->", YEARS)


# ---------------------------------------------------------------- borders.csv

# Step 1: collect every edge of every quarter. An edge that two quarters share is a
# border between quarters, an edge that belongs to only one quarter is the city border.
uses = Counter()
for outline in quarters.values():
    for a, b in zip(outline, outline[1:]):
        if a != b:
            uses[(min(a, b), max(a, b))] += 1

neighbours = defaultdict(list)       # neighbours[point] = list of (other point, kind of the edge)
for (a, b), count in uses.items():
    kind = "city" if count == 1 else "quarter"
    neighbours[a].append((b, kind))
    neighbours[b].append((a, kind))


# Step 2: join the edges to long lines. A line ends where borders meet (a point with
# three or more edges) or where the city border turns into a quarter border.
def is_end(point):
    edges = neighbours[point]
    return len(edges) != 2 or edges[0][1] != edges[1][1]


def walk(start, second, kind, done):
    # follow the border from start over second until the next end point
    line = [start, second]
    done.add((min(start, second), max(start, second)))
    while not is_end(line[-1]) and line[-1] != start:
        for point, _ in neighbours[line[-1]]:
            if point != line[-2]:
                done.add((min(line[-1], point), max(line[-1], point)))
                line.append(point)
                break
    return kind, line


lines = []
done = set()
for start in neighbours:
    if is_end(start):
        for second, kind in neighbours[start]:
            if (min(start, second), max(start, second)) not in done:
                lines.append(walk(start, second, kind, done))
# borders that form a closed loop without any end point
for start in neighbours:
    for second, kind in neighbours[start]:
        if (min(start, second), max(start, second)) not in done:
            lines.append(walk(start, second, kind, done))


# Step 3: remove points that are (almost) on a straight line between their neighbours.
def simplify(line):
    keep = {0, len(line) - 1}
    todo = [(0, len(line) - 1)]
    while todo:
        first, last = todo.pop()
        (e1, n1), (e2, n2) = line[first], line[last]
        length = math.dist(line[first], line[last])

        # find the point between first and last that is farthest away from the straight line
        farthest, distance = None, TOLERANCE
        for i in range(first + 1, last):
            e, n = line[i]
            if length == 0:
                d = math.dist(line[i], line[first])
            else:
                d = abs((e2 - e1) * (n1 - n) - (e1 - e) * (n2 - n1)) / length
            if d > distance:
                farthest, distance = i, d

        # if it is too far away to drop, keep it and look at both halves again
        if farthest is not None:
            keep.add(farthest)
            todo.append((first, farthest))
            todo.append((farthest, last))
    return [line[i] for i in sorted(keep)]


# Step 4: cut every piece where it crosses from one square into the next, so that the
# sketch can draw each piece on the roof of the tower it lies on.
def cut(a, b):
    (e1, n1), (e2, n2) = a, b
    stops = {0.0, 1.0}
    for start, end in ((e1, e2), (n1, n2)):
        low, high = min(start, end), max(start, end)
        for line in range(math.ceil(low / CELL), math.floor(high / CELL) + 1):
            if start != end:
                stops.add((line * CELL - start) / (end - start))
    stops = sorted(stops)
    return [((e1 + (e2 - e1) * t1, n1 + (n2 - n1) * t1), (e1 + (e2 - e1) * t2, n1 + (n2 - n1) * t2))
            for t1, t2 in zip(stops, stops[1:])]


rows = 0
with open(BORDERS, "w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file, lineterminator="\n")
    writer.writerow(["kind", "e1", "n1", "e2", "n2"])

    for kind, line in lines:
        line = simplify(line)
        for a, b in zip(line, line[1:]):
            for (e1, n1), (e2, n2) in cut(a, b):
                piece = [round(e1), round(n1), round(e2), round(n2)]
                if piece[:2] != piece[2:]:
                    writer.writerow([kind] + piece)
                    rows += 1

print(len(lines), "border lines,", rows, "pieces ->", BORDERS)
