"""Build data/site-data.js from the AFDC station CSV and the county outlines.

Follows the cleaning steps in the group's checkpoint notebook. The output is a
.js file, not .json, so the site also works when index.html is opened directly.

Run from the project root:  python scripts/build_data.py
"""
import json
import math
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "source"
OUT = ROOT / "data" / "site-data.js"

BOSTON = (42.3601, -71.0589)
RADIUS_KM = 40.2  # 25 miles

NETWORK_NAMES = {
    "ChargePoint Network": "ChargePoint", "AMPUP": "AmpUp", "RED_E": "Red E",
    "Tesla": "Tesla", "Tesla Destination": "Tesla", "Non-Networked": "Non-networked",
    "LOOP": "Loop", "FLO": "FLO", "Blink Network": "Blink", "QUICKCHARGE": "QuickCharge",
    "SWTCH": "SWTCH", "eVgo Network": "EVgo", "MERCEDES_BENZ": "Mercedes-Benz",
    "VIALYNK": "ViaLynk", "AUTEL": "Autel", "CHARGELAB": "ChargeLab",
    "CHARGESMART_EV": "ChargeSmart EV", "NOODOE": "Noodoe", "BP_PULSE": "bp pulse",
    "EVGATEWAY": "EVgateway", "XEAL": "Xeal", "AMPED_UP": "Amped Up", "EVOKE": "Evoke",
    "FORD_CHARGE": "Ford Charge", "SHELL_RECHARGE": "Shell Recharge",
    "RIVIAN_ADVENTURE": "Rivian Adventure", "SYNERGEV": "SynergEV", "ZEFNET": "ZEF Network",
    "GREEN_BRIDGE": "Green Bridge", "ITSELECTRIC": "it's electric", "IONNA": "IONNA",
    "APPLEGREEN": "Applegreen", "ABM": "ABM", "ELECTRIC_ERA": "Electric Era",
    "TURNONGREEN": "TurnOnGreen",
}


def km_from_boston(lat, lon):
    p = math.pi / 180
    a = ((lat - BOSTON[0]) * p / 2).map(math.sin) ** 2 + (lat * p).map(math.cos) * math.cos(
        BOSTON[0] * p
    ) * ((lon - BOSTON[1]) * p / 2).map(math.sin) ** 2
    return 2 * 6371 * a.map(math.sqrt).map(math.asin)


def load_records():
    raw = pd.read_csv(SOURCE / "alt_fuel_stations.csv", low_memory=False)
    rec = raw.rename(columns={
        "Station Name": "name", "Street Address": "street", "City": "city",
        "EV Level1 EVSE Num": "l1", "EV Level2 EVSE Num": "l2", "EV DC Fast Count": "dc",
        "EV Network": "network", "Latitude": "lat", "Longitude": "lon", "Open Date": "open_date",
    })[["name", "street", "city", "ZIP", "l1", "l2", "dc", "network", "lat", "lon", "open_date"]]

    # ZIPs load as numbers, and two Sturbridge records have a typo.
    zips = rec["ZIP"].astype("Int64").astype(str).str.zfill(5)
    typo = (zips == "15660") & (rec["city"].str.lower() == "sturbridge")
    rec["zip"] = zips.where(~typo, "01566")

    for col in ("l1", "l2", "dc"):
        rec[col] = rec[col].fillna(0).astype(int)
    rec["ports"] = rec["l1"] + rec["l2"] + rec["dc"]
    rec["open_year"] = pd.to_datetime(rec["open_date"]).dt.year
    rec["network"] = rec["network"].map(lambda n: NETWORK_NAMES.get(n, n))

    # One id per physical address: street + ZIP, lowercased, punctuation removed.
    street = (rec["street"].fillna("").str.lower()
              .str.replace(r"[^\w\s]", " ", regex=True)
              .str.replace(r"\s+", " ", regex=True).str.strip())
    rec["addr_id"] = (street + "|" + rec["zip"]).factorize()[0]
    return rec


def growth(rec):
    yearly = rec.groupby("open_year")[["l1", "l2", "dc"]].sum()
    yearly = yearly.reindex(range(int(yearly.index.min()), int(yearly.index.max()) + 1), fill_value=0)
    cum = yearly.cumsum().reset_index().rename(columns={"open_year": "year"})
    return cum.astype(int).to_dict("records")


def networks(rec, level, top=7):
    totals = rec.groupby("network")[level].sum().sort_values(ascending=False)
    total = int(totals.sum())
    head = totals.head(top)
    rows = [{"name": n, "ports": int(p), "share": p / total} for n, p in head.items()]
    other = total - int(head.sum())
    rows.append({"name": "All others", "ports": other, "share": other / total})
    return rows


def map_data(rec):
    g = rec.groupby("addr_id")
    sites = pd.DataFrame({
        "name": g["name"].first(), "street": g["street"].first(), "city": g["city"].first(),
        "lat": g["lat"].mean().round(5), "lon": g["lon"].mean().round(5),
        # A shared address can hold several networks, so list all of them.
        "networks": g["network"].agg(lambda s: ", ".join(s.value_counts().index)),
    }).reset_index()
    rows = (rec.groupby(["addr_id", "open_year"])[["l1", "l2", "dc"]].sum().reset_index()
            .astype(int).values.tolist())
    return sites.to_dict("records"), rows


def ring():
    """A line 25 miles from downtown Boston, as lon/lat pairs."""
    points = []
    for deg in range(0, 361, 5):
        t = math.radians(deg)
        lat = BOSTON[0] + math.degrees(RADIUS_KM / 6371) * math.cos(t)
        lon = BOSTON[1] + math.degrees(RADIUS_KM / 6371) * math.sin(t) / math.cos(math.radians(BOSTON[0]))
        points.append([round(lon, 4), round(lat, 4)])
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": points}, "properties": {}}


def main():
    rec = load_records()
    near = km_from_boston(rec["lat"], rec["lon"]) <= RADIUS_KM
    sites, rows = map_data(rec)

    cities = (rec.assign(city=rec["city"].str.strip().str.title()).groupby("city")[["l2", "dc", "ports"]]
              .sum().sort_values("ports", ascending=False).head(10).reset_index().to_dict("records"))

    data = {
        "growth": growth(rec),
        "networks": {"l2": networks(rec, "l2"), "dc": networks(rec, "dc")},
        "sites": sites,
        "rows": rows,
        "cities": cities,
        "counties": json.loads((SOURCE / "ma_counties.geojson").read_text())["features"],
        "ring": ring(),
    }
    OUT.write_text("window.SITE_DATA = " + json.dumps(data, separators=(",", ":"), default=int) + ";\n",
                   encoding="utf-8")

    # Every number quoted in index.html comes from this printout.
    print(f"records {len(rec):,}  addresses {rec['addr_id'].nunique():,}  ports {rec['ports'].sum():,}")
    print(f"L1 {rec['l1'].sum()}  L2 {rec['l2'].sum():,}  DC {rec['dc'].sum():,}  L2 share {rec['l2'].sum()/rec['ports'].sum():.1%}")
    print(f"within 25 mi: all {rec.loc[near,'ports'].sum()/rec['ports'].sum():.1%}  DC {rec.loc[near,'dc'].sum()/rec['dc'].sum():.1%}")
    opened_before_2021 = rec.loc[rec['open_year'] < 2021, 'ports'].sum()
    print(f"ports opened before 2021: {opened_before_2021:,}  DC added 2024+: {rec.loc[rec['open_year'] >= 2024,'dc'].sum()/rec['dc'].sum():.1%}")
    print(f"max ports at one address: {rec.groupby('addr_id')['ports'].sum().max()}")
    print("L2:", [(r['name'], r['ports'], round(r['share'], 3)) for r in data['networks']['l2']])
    print("DC:", [(r['name'], r['ports'], round(r['share'], 3)) for r in data['networks']['dc']])
    print("cities:", [(c['city'], c['ports']) for c in cities[:4]])
    print(f"{OUT.name}: {OUT.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
