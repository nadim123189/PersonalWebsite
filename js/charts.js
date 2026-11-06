const D = window.SITE_DATA;

const INK = "#14241d";
const MUTED = "#55645c";
const GRID = "#dfe5d6";
const LEVELS = ["Level 1", "Level 2", "DC fast"];
const LEVEL_COLORS = ["#8A6BD1", "#00856B", "#D9780A"];
const LEVEL_SCALE = { domain: LEVELS, range: LEVEL_COLORS };
const NARROW = 620;

const config = {
  font: "'Libre Franklin', Arial, sans-serif",
  background: "#ffffff",
  view: { stroke: null },
  axis: {
    labelFontSize: 12, titleFontSize: 13, labelColor: MUTED, titleColor: MUTED,
    gridColor: GRID, domainColor: "#a9b5a6", tickColor: "#a9b5a6",
  },
  legend: { labelFontSize: 12, titleFontSize: 13, labelColor: INK, titleColor: INK, symbolType: "circle" },
};

const fmt = (n) => n.toLocaleString("en-US");
const widthOf = (id) => document.getElementById(id).clientWidth;

function embed(id, spec, renderer = "svg") {
  return vegaEmbed(`#${id}`, { $schema: "https://vega.github.io/schema/vega-lite/v5.json", config, ...spec }, {
    actions: false,
    renderer,
  });
}

function table(id, headers, rows) {
  const head = headers.map((h) => `<th scope="col">${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  document.getElementById(id).innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* 1. When: cumulative ports by level */
function drawGrowth() {
  const width = widthOf("chart-growth");
  const narrow = width < NARROW;
  const long = D.growth.flatMap((d) => [
    { year: d.year, level: "Level 1", ord: 0, ports: d.l1 },
    { year: d.year, level: "Level 2", ord: 1, ports: d.l2 },
    { year: d.year, level: "DC fast", ord: 2, ports: d.dc },
  ]);
  const last = D.growth[D.growth.length - 1];
  const total = last.l1 + last.l2 + last.dc;
  const share = (n) => Math.round((n / total) * 100);
  const labels = [
    { year: last.year, mid: last.l1 + last.l2 / 2, label: `Level 2: ${fmt(last.l2)} (${share(last.l2)}%)` },
    { year: last.year, mid: last.l1 + last.l2 + last.dc / 2, label: `DC fast: ${fmt(last.dc)} (${share(last.dc)}%)` },
  ];
  const right = narrow ? 8 : 160;
  const x = {
    field: "year", type: "quantitative", title: null,
    scale: { domain: [2009, 2026], nice: false },
    axis: {
      format: "d",
      grid: false,
      values: narrow ? [2010, 2014, 2018, 2022, 2026] : [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026],
    },
  };
  const layer = [
    {
      data: { values: long },
      mark: { type: "area", stroke: "#ffffff", strokeWidth: 2 },
      encoding: {
        x,
        y: { field: "ports", type: "quantitative", stack: "zero", title: "Cumulative public ports", axis: { format: ",d", tickCount: 6 } },
        color: { field: "level", type: "nominal", scale: LEVEL_SCALE, title: "Charger level", legend: { orient: "top", direction: "horizontal" } },
        order: { field: "ord", type: "quantitative" },
      },
    },
    {
      data: { values: D.growth },
      params: [{ name: "hover", select: { type: "point", fields: ["year"], nearest: true, on: "pointerover", clear: "pointerout", toggle: false } }],
      mark: { type: "rule", color: INK, strokeWidth: 1.5 },
      encoding: {
        x,
        opacity: { condition: { param: "hover", empty: false, value: 0.6 }, value: 0 },
        tooltip: [
          { field: "year", type: "ordinal", title: "Through" },
          { field: "l2", type: "quantitative", title: "Level 2 ports", format: "," },
          { field: "dc", type: "quantitative", title: "DC fast ports", format: "," },
          { field: "l1", type: "quantitative", title: "Level 1 ports", format: "," },
        ],
      },
    },
  ];
  if (!narrow) {
    layer.push({
      data: { values: labels },
      mark: { type: "text", align: "left", dx: 8, fontSize: 13, fontWeight: 700, color: INK },
      encoding: {
        x: { field: "year", type: "quantitative" },
        y: { field: "mid", type: "quantitative" },
        text: { field: "label" },
      },
    });
  }
  return embed("chart-growth", {
    width: width - 70 - right,
    height: narrow ? 280 : 400,
    // Autosize already makes room for the direct labels, so `right` only shrinks the plot.
    padding: { left: 5, top: 5, bottom: 5, right: 8 },
    autosize: { type: "pad" },
    layer,
  });
}

/* 2. Where: map of addresses */
let mapThrough = 2026;

function updateMapCount() {
  let ports = 0;
  const addresses = new Set();
  D.rows.forEach(([id, year, l1, l2, dc]) => {
    if (year <= mapThrough) {
      ports += l1 + l2 + dc;
      addresses.add(id);
    }
  });
  document.getElementById("map-count").textContent =
    `Through ${mapThrough}: ${fmt(ports)} ports at ${fmt(addresses.size)} addresses`;
}

function drawMap() {
  const full = widthOf("chart-map");
  const narrow = full < NARROW;
  const width = narrow ? full - 12 : full - 165;
  const height = Math.round(width * 0.58);
  const rows = D.rows.map(([addr_id, open_year, l1, l2, dc]) => ({ addr_id, open_year, l1, l2, dc, ports: l1 + l2 + dc }));
  const places = [
    { name: "Boston", lon: -71.0589, lat: 42.3601 }, { name: "Worcester", lon: -71.8023, lat: 42.2626 },
    { name: "Springfield", lon: -72.5898, lat: 42.1015 }, { name: "Pittsfield", lon: -73.2454, lat: 42.4501 },
    // These three collide with their neighbors on a phone-width map.
    ...(narrow ? [] : [
      { name: "Lowell", lon: -71.3162, lat: 42.6334 }, { name: "Hyannis", lon: -70.3002, lat: 41.6525 },
      { name: "New Bedford", lon: -70.9342, lat: 41.6362 },
    ]),
  ];
  const placeEncoding = {
    longitude: { field: "lon", type: "quantitative" },
    latitude: { field: "lat", type: "quantitative" },
    text: { field: "name" },
  };
  const placeMark = { type: "text", dy: -11, fontSize: 12, fontWeight: 700, clip: true };
  const legendOrient = narrow ? "bottom" : "right";

  return embed("chart-map", {
    description: "Map of Massachusetts with a dot for each charging address. Dots are densest inside a ring 25 miles from Boston.",
    width,
    height,
    autosize: { type: "pad" },
    params: [
      { name: "through", value: mapThrough, bind: { input: "range", min: 2009, max: 2026, step: 1, name: "Stations opened through" } },
    ],
    projection: { type: "mercator", center: [-71.7, 42.1], scale: Math.round(width * 14.4) },
    layer: [
      {
        data: { values: D.counties },
        mark: { type: "geoshape", fill: "#e9eee2", stroke: "#ffffff", strokeWidth: 1, clip: true },
      },
      {
        data: { values: [D.ring] },
        mark: { type: "geoshape", filled: false, stroke: MUTED, strokeWidth: 1, strokeDash: [4, 4], clip: true },
      },
      {
        data: { values: rows },
        transform: [
          { filter: "datum.open_year <= through" },
          {
            aggregate: [
              { op: "sum", field: "l1", as: "l1" }, { op: "sum", field: "l2", as: "l2" },
              { op: "sum", field: "dc", as: "dc" }, { op: "sum", field: "ports", as: "ports" },
              { op: "min", field: "open_year", as: "first_year" },
            ],
            groupby: ["addr_id"],
          },
          { calculate: "datum.dc > 0 ? 'DC fast' : (datum.l2 > 0 ? 'Level 2' : 'Level 1')", as: "level" },
          { lookup: "addr_id", from: { data: { values: D.sites }, key: "addr_id", fields: ["name", "street", "city", "networks", "lat", "lon"] } },
        ],
        mark: { type: "circle", stroke: "#ffffff", strokeWidth: 0.5, clip: true },
        encoding: {
          longitude: { field: "lon", type: "quantitative" },
          latitude: { field: "lat", type: "quantitative" },
          size: {
            field: "ports", type: "quantitative",
            scale: { domain: [0, 130], range: [0, 600] },
            legend: { title: "Ports at address", orient: legendOrient, values: narrow ? [2, 40, 130] : [2, 10, 40, 130], symbolFillColor: "#a9b5a6", symbolStrokeColor: "#a9b5a6" },
          },
          color: {
            field: "level", type: "nominal", scale: LEVEL_SCALE,
            legend: { title: "Fastest charger", orient: legendOrient, symbolSize: 90, symbolOpacity: 1 },
          },
          opacity: { value: 0.8 },
          order: { field: "ports", type: "quantitative", sort: "descending" },
          tooltip: [
            { field: "name", title: "Listed as" }, { field: "street", title: "Address" }, { field: "city", title: "City" },
            { field: "networks", title: "Networks" }, { field: "ports", type: "quantitative", title: "Total ports" },
            { field: "l2", type: "quantitative", title: "Level 2 ports" }, { field: "dc", type: "quantitative", title: "DC fast ports" },
            { field: "first_year", type: "ordinal", title: "First opened" },
          ],
        },
      },
      {
        data: { values: places },
        mark: { ...placeMark, color: "#ffffff", stroke: "#ffffff", strokeWidth: 3 },
        encoding: placeEncoding,
      },
      {
        data: { values: places },
        mark: { ...placeMark, color: INK },
        encoding: placeEncoding,
      },
    ],
  }, "canvas").then((result) => {
    result.view.addSignalListener("through", (_, value) => {
      mapThrough = value;
      updateMapCount();
    });
    return result;
  });
}

/* 3. Who: ranked networks for each level, drawn with D3 */
const barTip = d3.select("body").append("div").attr("class", "bar-tip");

function drawNetwork(id, rows, color) {
  const width = widthOf(id);
  const margin = { top: 4, right: 20, bottom: 4, left: 116 };
  const height = rows.length * 30 + margin.top + margin.bottom;

  const x = d3.scaleLinear().domain([0, 1]).range([0, width - margin.left - margin.right]);
  const y = d3.scaleBand().domain(rows.map((d) => d.name)).range([margin.top, height - margin.bottom]);

  const root = d3.select(`#${id}`);
  root.selectAll("*").remove();
  const svg = root.append("svg").attr("width", width).attr("height", height);

  const row = svg.selectAll("g").data(rows).join("g")
    .attr("transform", (d) => `translate(${margin.left},${y(d.name) + y.bandwidth() / 2})`);

  row.append("text")
    .attr("class", "bar-name")
    .attr("x", -6)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text((d) => d.name);

  row.append("rect")
    .attr("y", -9)
    .attr("height", 18)
    .attr("width", (d) => x(d.share))
    .attr("rx", 3)
    .attr("fill", (d) => (d.name === "All others" ? "#a9b5a6" : color))
    .on("pointerenter pointermove", (event, d) => {
      barTip
        .html(`<b>${d.name}</b><br>${fmt(d.ports)} ports<br>${(d.share * 100).toFixed(1)}% of this level`)
        .style("display", "block");
      const room = window.innerWidth - barTip.node().offsetWidth - 8;
      barTip.style("left", `${Math.min(event.clientX + 12, room)}px`).style("top", `${event.clientY + 12}px`);
    })
    .on("pointerleave", () => barTip.style("display", "none"));

  row.append("text")
    .attr("class", "bar-value")
    .attr("x", (d) => x(d.share) + 6)
    .attr("dy", "0.35em")
    .text((d) => `${Math.round(d.share * 100)}% (${fmt(d.ports)})`);
}

function drawAll() {
  drawGrowth();
  drawMap();
  drawNetwork("chart-net-l2", D.networks.l2, LEVEL_COLORS[1]);
  drawNetwork("chart-net-dc", D.networks.dc, LEVEL_COLORS[2]);
}

table("table-growth", ["Through", "Level 1", "Level 2", "DC fast", "Total"],
  D.growth.map((d) => [d.year, fmt(d.l1), fmt(d.l2), fmt(d.dc), fmt(d.l1 + d.l2 + d.dc)]));
table("table-cities", ["City", "Level 2", "DC fast", "Total ports"],
  D.cities.map((c) => [c.city, fmt(c.l2), fmt(c.dc), fmt(c.ports)]));
table("table-networks", ["Network", "Level", "Ports", "Share of level"], [
  ...D.networks.l2.map((r) => [r.name, "Level 2", fmt(r.ports), `${(r.share * 100).toFixed(1)}%`]),
  ...D.networks.dc.map((r) => [r.name, "DC fast", fmt(r.ports), `${(r.share * 100).toFixed(1)}%`]),
]);

updateMapCount();
document.fonts.ready.then(drawAll);

// Redraw only when the width changes, since phones fire resize while scrolling.
let lastWidth = window.innerWidth;
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth !== lastWidth) {
      lastWidth = window.innerWidth;
      drawAll();
    }
  }, 200);
});
