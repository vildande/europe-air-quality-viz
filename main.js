const mapSvg = d3.select("#map");
const boxSvg = d3.select("#boxplot");
const trendSvg = d3.select("#trend");
const compareSvg = d3.select("#countryCompare");

const germanySvg = d3.select("#germanyMap");
const germanyBoxSvg = d3.select("#germanyBoxplot");
const germanyTrendSvg = d3.select("#germanyTrend");

const baseSymbolSize = 40; // base size for symbols
let mapTransform = d3.zoomIdentity; // remembers current pan/zoom
let germanyTransform = d3.zoomIdentity;

const shape = {
  background: d3.symbolCircle,
  traffic: d3.symbolTriangle,
  industrial: d3.symbolSquare,
};

function attachMapZoom({
  svg,
  getTransform,
  setTransform,
  baseSymbolSize,
  shape,
}) {
  const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      const transform = event.transform;
      setTransform(transform);

      const plot = svg.select("g.plot-layer");
      plot.attr("transform", transform);

      const sym = d3
        .symbol()
        .size(baseSymbolSize / (transform.k * transform.k))
        .type((d) => shape[d.station_type] || d3.symbolCircle);

      plot
        .selectAll("path.station")
        .attr("d", sym)
        .attr("stroke-width", 1 / transform.k);
    });

  svg.call(zoom);
  svg.call(zoom.transform, getTransform());
  return zoom;
}

const worldZoom = attachMapZoom({
  svg: mapSvg,
  getTransform: () => mapTransform,
  setTransform: (t) => (mapTransform = t),
  baseSymbolSize,
  shape,
});

const deZoom = attachMapZoom({
  svg: germanySvg,
  getTransform: () => germanyTransform,
  setTransform: (t) => (germanyTransform = t),
  baseSymbolSize,
  shape,
});

function initWorldZoom() {
  const s = 1; // inititial zoom level
  const w = +mapSvg.attr("width");
  const h = +mapSvg.attr("height");

  mapTransform = d3.zoomIdentity
    .translate((w * (1 - s)) / 2, (h * (1 - s)) / 2)
    .scale(s);

  mapSvg.call(worldZoom.transform, mapTransform);
}

function initGermanyZoom() {
  const s = 4; // initial zoom level
  const [cx, cy] = projectionDE([10.5, 51.2]); // Germany-ish center

  const w = +germanySvg.attr("width");
  const h = +germanySvg.attr("height");

  germanyTransform = d3.zoomIdentity
    .translate(w / 2 - s * cx, h / 2 - s * cy)
    .scale(s);

  germanySvg.call(deZoom.transform, germanyTransform);
}

const tooltip = d3.select(".tooltip");

let data;
let currentYear = 2019;

const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

let worldCountries = null;

const worldTopoPromise = d3.json(WORLD_URL).then((world) => {
  worldCountries = topojson.feature(world, world.objects.countries).features;
  return worldCountries;
});

Promise.all([
  d3.csv("data/air_quality_annual_viz.csv", (d) => ({
    station_id: d.station_id,
    country: d.country,
    year: +d.year,
    lat: +d.lat,
    lon: +d.lon,
    station_type: d.station_type,
    station_area: d.station_area,
    NO2: +d.NO2,
  })),
  worldTopoPromise,
]).then(([loaded, countries]) => {
  data = loaded;
  colorNO2.domain(d3.extent(data, (d) => d.NO2));
  drawAll();
  initWorldZoom();
  initGermanyZoom();
});

// View 1: Projection + Base Map

const wWorld = +mapSvg.attr("width");
const hWorld = +mapSvg.attr("height");

const wDE = +germanySvg.attr("width");
const hDE = +germanySvg.attr("height");

const baseCenter = [15, 50]; // lon, lat rouhgly center of Europe
const baseScale = 600; // zoom level

const projectionWorld = d3
  .geoMercator()
  .center(baseCenter)
  .scale(baseScale)
  .translate([wWorld / 2, hWorld / 2]);

const pathWorld = d3.geoPath().projection(projectionWorld);

const projectionDE = d3
  .geoMercator()
  .center(baseCenter)
  .scale(baseScale)
  .translate([wDE / 2, hDE / 2]);

const pathDE = d3.geoPath().projection(projectionDE);

const colorNO2 = d3
  .scaleSequential(d3.interpolateReds)
  .domain([0, d3.max(data ?? [], (d) => d.NO2)]);

// Draw Map

function ensureMapLayers(svg) {
  const plot = svg
    .selectAll("g.plot-layer")
    .data([null])
    .join("g")
    .attr("class", "plot-layer");

  const ui = svg
    .selectAll("g.ui-layer")
    .data([null])
    .join("g")
    .attr("class", "ui-layer");

  ui.raise(); // ensure ui is on top
  return { plot, ui };
}

function drawMap(svg, transform, projection, path, filtered) {
  if (!worldCountries) return; // topo not ready yet

  const { plot, ui } = ensureMapLayers(svg);

  const countriesLayer = plot
    .selectAll("g.countries")
    .data([null])
    .join("g")
    .attr("class", "countries");

  const stationsLayer = plot
    .selectAll("g.stations")
    .data([null])
    .join("g")
    .attr("class", "stations");

  // Countries (static; just redraw paths)
  countriesLayer
    .selectAll("path.country")
    .data(worldCountries)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", "#f5f5f5")
    .attr("stroke", "#999")
    .attr("stroke-width", 1 / transform.k);

  // Stations (update only what changed)
  const sym = d3
    .symbol()
    .size(baseSymbolSize / (transform.k * transform.k))
    .type((d) => shape[d.station_type] || d3.symbolCircle);

  stationsLayer
    .selectAll("path.station")
    .data(filtered, (d) => d.station_id)
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "station")
          .on("mouseover", (event, d) => {
            tooltip
              .style("opacity", 1)
              .html(
                `
              <strong>${d.station_id}</strong><br>
              ${d.country}<br>
              ${d.station_type}<br>
              NO₂: ${d.NO2.toFixed(1)}
            `,
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY + 10 + "px");
          })
          .on("mouseout", () => tooltip.style("opacity", 0)),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("transform", (d) => `translate(${projection([d.lon, d.lat])})`)
    .attr("d", sym)
    .attr("fill", (d) => colorNO2(d.NO2))
    .attr("stroke", "#333")
    .attr("stroke-width", 1 / transform.k);
  stationsLayer.raise(); // keep stations on top
  ui.raise(); // keep title/legend on top even after async appends
}

function filterByCountry(countryCode) {
  return data.filter(
    (d) => d.year === currentYear && d.country === countryCode,
  );
}
function drawShapeLegend(svg, x, y) {
  const items = ["background", "traffic", "industrial"];

  const legend = svg
    .selectAll("g.shape-legend")
    .data([null])
    .join("g")
    .attr("class", "shape-legend")
    .attr("transform", `translate(${x},${y})`);

  legend.selectAll("*").remove();

  // Panel behind legend for readability
  legend
    .append("rect")
    .attr("x", -10)
    .attr("y", -22)
    .attr("width", 170)
    .attr("height", 90)
    .attr("rx", 6)
    .attr("fill", "white")
    .attr("opacity", 0.75)
    .attr("stroke", "#ccc");

  // Legend title
  legend
    .append("text")
    .attr("x", 0)
    .attr("y", -6)
    .style("font-weight", "600")
    .text("Station type");

  items.forEach((t, i) => {
    const row = legend.append("g").attr("transform", `translate(0,${i * 20})`);

    row
      .append("path")
      .attr("d", d3.symbol().size(80).type(shape[t])) // symbol generator
      .attr("transform", "translate(10,10)")
      .attr("fill", "#fff")
      .attr("stroke", "#333");

    row.append("text").attr("x", 25).attr("y", 14).text(t);
  });
}

function drawColorLegend(svg, uiLayer, x, y, width = 140, height = 10) {
  const legend = uiLayer
    .selectAll("g.color-legend")
    .data([null])
    .join("g")
    .attr("class", "color-legend")
    .attr("transform", `translate(${x},${y})`);

  // defs + gradient
  const defs = svg.selectAll("defs").data([null]).join("defs");
  const gradId = svg.attr("id") + "-no2-gradient";

  const gradient = defs
    .selectAll(`#${gradId}`)
    .data([null])
    .join("linearGradient")
    .attr("id", gradId)
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "100%")
    .attr("y2", "0%"); // horizontal gradient

  const stops = d3.range(0, 1.0001, 0.1);
  gradient
    .selectAll("stop")
    .data(stops)
    .join("stop")
    .attr("offset", (d) => `${d * 100}%`)
    .attr("stop-color", (d) =>
      colorNO2(
        colorNO2.domain()[0] +
          d * (colorNO2.domain()[1] - colorNO2.domain()[0]),
      ),
    );

  legend.selectAll("*").remove();

  // Panel behind legend for readability
  legend
    .append("rect")
    .attr("x", -10)
    .attr("y", -22)
    .attr("width", Math.max(170, width + 30))
    .attr("height", 70)
    .attr("rx", 6)
    .attr("fill", "white")
    .attr("opacity", 0.75)
    .attr("stroke", "#ccc");

  // Label
  legend
    .append("text")
    .attr("x", 0)
    .attr("y", 0)
    .style("font-weight", "600")
    .text("NO₂ level (µg/m³)");

  // move gradient bar down a bit
  const barY = 10;

  legend
    .append("rect")
    .attr("x", 0)
    .attr("y", barY)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", `url(#${gradId})`);

  const xScale = d3.scaleLinear().domain(colorNO2.domain()).range([0, width]);

  legend
    .append("g")
    .attr("transform", `translate(0,${barY + height})`)
    .call(d3.axisBottom(xScale).ticks(3));
}

// View 2: Box Plot (Distribution Comparison)

const boxMargin = { top: 35, right: 15, bottom: 50, left: 60 };

function innerSizeFromG(g, margin) {
  const svgNode = g.node().ownerSVGElement; // the parent <svg>
  const W = +svgNode.getAttribute("width");
  const H = +svgNode.getAttribute("height");
  return {
    innerW: W - margin.left - margin.right,
    innerH: H - margin.top - margin.bottom,
  };
}

const boxG = boxSvg
  .append("g")
  .attr("transform", `translate(${boxMargin.left},${boxMargin.top})`);

const xBox = d3
  .scaleBand()
  .domain(["background", "traffic", "industrial"])
  .padding(0.4);

const yBox = d3.scaleLinear();

// germany boxplot setup (separate <g> and separate y-scale)
const germanyBoxG = germanyBoxSvg
  .append("g")
  .attr("transform", `translate(${boxMargin.left},${boxMargin.top})`);

const yBoxDE = d3.scaleLinear();

function styleAxis(axisG, tickPx = 14) {
  axisG.selectAll(".tick text").style("font-size", `${tickPx}px`);
  axisG.selectAll(".domain").style("stroke-width", 1.2);
}

// draw Box Plot
function drawBoxplot(g, xScale, yScale, filtered) {
  const { innerW, innerH } = innerSizeFromG(g, boxMargin);

  // update ranges based on current svg size
  xScale.range([0, innerW]);
  yScale.range([innerH, 0]);

  g.selectAll("*").remove();

  yScale.domain(d3.extent(filtered, (d) => d.NO2)).nice();

  const xAxisG = g
    .append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale));

  styleAxis(xAxisG, 14);

  const yAxisG = g.append("g").call(d3.axisLeft(yScale));

  styleAxis(yAxisG, 14);

  g.append("text")
    .attr("x", -innerH / 2)
    .attr("y", -40)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .text("Annual mean NO2 (µg/m³)");

  g.selectAll("text").style("font-size", "16px");

  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .text("Station type");

  const grouped = d3.group(filtered, (d) => d.station_type);

  grouped.forEach((values, key) => {
    const sorted = values.map((d) => d.NO2).sort(d3.ascending);
    const q1 = d3.quantile(sorted, 0.25);
    const med = d3.quantile(sorted, 0.5);
    const q3 = d3.quantile(sorted, 0.75);
    const min = d3.min(sorted);
    const max = d3.max(sorted);

    const x = xScale(key) + xScale.bandwidth() / 2;

    g.append("line")
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", yScale(min))
      .attr("y2", yScale(max))
      .attr("stroke", "black");

    g.append("rect")
      .attr("x", xScale(key))
      .attr("y", yScale(q3))
      .attr("height", yScale(q1) - yScale(q3))
      .attr("width", xScale.bandwidth())
      .attr("fill", colorNO2(med))
      .attr("stroke", "black");

    g.append("line")
      .attr("x1", xScale(key))
      .attr("x2", xScale(key) + xScale.bandwidth())
      .attr("y1", yScale(med))
      .attr("y2", yScale(med))
      .attr("stroke", "black");
  });
}

// View 3: Trend Line (Aggregated) (Temporal Analysis)

function aggregateTrend(subset) {
  return d3.rollups(
    subset,
    (v) => d3.mean(v, (d) => d.NO2),
    (d) => d.station_type,
    (d) => d.year,
  );
}

// scales for Trend Line
const trendMargin = { top: 35, right: 20, bottom: 50, left: 60 };

const trendG = trendSvg
  .append("g")
  .attr("transform", `translate(${trendMargin.left},${trendMargin.top})`);

const xTrend = d3.scaleLinear().domain([2015, 2023]);

const yTrend = d3.scaleLinear();

// Germany trend setup (separate <g> and separate y-scale)
const germanyTrendG = germanyTrendSvg
  .append("g")
  .attr("transform", `translate(${trendMargin.left},${trendMargin.top})`);

const yTrendDE = d3.scaleLinear();

const colorType = d3
  .scaleOrdinal()
  .domain(["background", "traffic", "industrial"])
  .range(["green", "red", "purple"]);

function drawLegend(svg, x, y) {
  const legend = svg
    .selectAll("g.type-legend")
    .data([null])
    .join("g")
    .attr("class", "type-legend")
    .attr("transform", `translate(${x},${y})`);

  legend.selectAll("*").remove();

  ["background", "traffic", "industrial"].forEach((t, i) => {
    const g = legend.append("g").attr("transform", `translate(0,${i * 20})`);

    g.append("line")
      .attr("x1", 0)
      .attr("x2", 20)
      .attr("y1", 10)
      .attr("y2", 10)
      .attr("stroke", colorType(t))
      .attr("stroke-width", 2);

    g.append("text").attr("x", 30).attr("y", 14).text(t);
  });
}

// draw Trend Line
function drawTrend(g, xScale, yScale, subsetAllYears) {
  const { innerW, innerH } = innerSizeFromG(g, trendMargin);

  // update ranges based on current svg size
  xScale.range([0, innerW]);
  yScale.range([innerH, 0]);

  g.selectAll("*").remove();

  const agg = aggregateTrend(subsetAllYears);

  const flat = agg.flatMap(([type, arr]) =>
    arr.map(([year, val]) => ({ type, year, val })),
  );

  yScale.domain(d3.extent(flat, (d) => d.val)).nice();

  const xScaleG = g
    .append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).ticks(9).tickFormat(d3.format("d")));

  styleAxis(xScaleG, 14);

  const yScaleG = g.append("g").call(d3.axisLeft(yScale));

  styleAxis(yScaleG, 14);

  // Y label
  g.append("text")
    .attr("x", -innerH / 2)
    .attr("y", -40)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .text("Annual mean NO2 (µg/m³)");

  // X label
  g.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 40)
    .attr("text-anchor", "middle")
    .text("Year");

  const line = d3
    .line()
    .x((d) => xScale(d.year))
    .y((d) => yScale(d.val));

  agg.forEach(([type, values]) => {
    const sorted = values.slice().sort((a, b) => d3.ascending(a[0], b[0]));

    g.append("path")
      .datum(sorted.map(([year, val]) => ({ year, val })))
      .attr("fill", "none")
      .attr("stroke", colorType(type))
      .attr("stroke-width", 2)
      .attr("d", line);
  });
}

// View 4: Country Comparison

const compareMargin = { top: 40, right: 40, bottom: 50, left: 80 };

const compareG = compareSvg
  .append("g")
  .attr("transform", `translate(${compareMargin.left},${compareMargin.top})`);

const xCompare = d3.scaleLinear();
const yCompare = d3.scaleBand().padding(0.2);

const compareTop = 15;

function aggregateCountryNO2(yearData) {
  return Array.from(
    d3.rollups(
      yearData,
      (v) => d3.mean(v, (d) => d.NO2),
      (d) => d.country,
    ),
    ([country, meanNO2]) => ({ country, meanNO2 }),
  )
    .sort((a, b) => d3.descending(a.meanNO2, b.meanNO2))
    .slice(0, compareTop); // top countries
}

function drawCountryComparison(yearData) {
  const { innerW, innerH } = innerSizeFromG(compareG, compareMargin);

  compareG.selectAll("*").remove();

  const topCountries = aggregateCountryNO2(yearData);
  if (!topCountries.length) return;

  xCompare
    .domain([0, d3.max(topCountries, (d) => d.meanNO2)])
    .range([0, innerW])
    .nice();

  yCompare.domain(topCountries.map((d) => d.country)).range([0, innerH]);

  // hatch pattern for bars
  const defs = compareSvg.selectAll("defs").data([null]).join("defs");
  const pattId = `${compareSvg.attr("id")}-barHatch`;

  const hatch = defs
    .selectAll(`#${pattId}`)
    .data([null])
    .join("pattern")
    .attr("id", pattId)
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .attr("patternTransform", "rotate(45)");

  hatch
    .selectAll("line")
    .data([null])
    .join("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", 0)
    .attr("y2", 6)
    .attr("stroke", "#000")
    .attr("stroke-width", 2)
    .attr("opacity", 0.18);

  const barsLayer = compareG.append("g").attr("class", "bars");
  const labelsLayer = compareG.append("g").attr("class", "labels");
  const axesLayer = compareG.append("g").attr("class", "axes");

  // Bars
  const bars = barsLayer
    .selectAll("rect.bar")
    .data(topCountries, (d) => d.country)
    .join("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", (d) => yCompare(d.country))
    .attr("height", yCompare.bandwidth())
    .attr("width", (d) => xCompare(d.meanNO2))
    .attr("fill", (d) => colorNO2(d.meanNO2))
    .attr("stroke", "#333")
    .attr("stroke-width", 1);

  // Hatch overlay on every other bar
  barsLayer
    .selectAll("rect.bar-hatch")
    .data(topCountries, (d) => d.country)
    .join("rect")
    .attr("class", "bar-hatch")
    .attr("x", 0)
    .attr("y", (d) => yCompare(d.country))
    .attr("height", yCompare.bandwidth())
    .attr("width", (d) => xCompare(d.meanNO2))
    .attr("fill", `url(#${pattId})`)
    .attr("opacity", (d, i) => (i % 2 ? 1 : 0))
    .attr("pointer-events", "none");

  // hover highlight row
  bars
    .on("mouseover", function () {
      d3.select(this).attr("stroke-width", 2);
    })
    .on("mouseout", function () {
      d3.select(this).attr("stroke-width", 1);
    });

  // Value labels
  labelsLayer
    .selectAll("text.value")
    .data(topCountries, (d) => d.country)
    .join("text")
    .attr("class", "value")
    .attr("x", (d) => xCompare(d.meanNO2) + 6)
    .attr("y", (d) => yCompare(d.country) + yCompare.bandwidth() / 2 + 4)
    .text((d) => d.meanNO2.toFixed(1))
    .style("font-size", "16px");

  // Axes
  const yAxisG = axesLayer.append("g").call(d3.axisLeft(yCompare));

  styleAxis(yAxisG, 16);

  const xAxisG = axesLayer
    .append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(xCompare));

  styleAxis(xAxisG, 14);

  xAxisG
    .append("text")
    .attr("x", innerW / 2)
    .attr("y", 35)
    .attr("fill", "#000")
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .text("Mean annual NO2 (µg/m³)");

  // Title
  const svgW = +compareSvg.attr("width");

  compareSvg
    .selectAll("text.chart-title")
    .data([
      `TOP ${compareTop} Most Polluted Countries by NO2 - World - Year ${currentYear}`,
    ])
    .join("text")
    .attr("class", "chart-title")
    .attr("x", svgW / 2)
    .attr("y", 25)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "600")
    .text((d) => d);
}

// Chart Title
function setTitleUILayer(uiLayer, svg, text) {
  const w = +svg.attr("width");
  uiLayer
    .selectAll("text.chart-title")
    .data([text])
    .join("text")
    .attr("class", "chart-title")
    .attr("x", w / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "600")
    .text((d) => d);
}
function setTitle(svg, text) {
  const w = +svg.attr("width");
  svg
    .selectAll("text.chart-title")
    .data([text])
    .join("text")
    .attr("class", "chart-title")
    .attr("x", w / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "600")
    .text((d) => d);
}

// link everything (year slider)

function drawAll() {
  const worldYear = data.filter((d) => d.year === currentYear); // World for selected year
  const deYear = worldYear.filter((d) => d.country === "DE"); // Germany for selected year
  const deAllYears = data.filter((d) => d.country === "DE"); // Germany for all years

  const legendX = 20;
  const shapeLegendY = 40;
  const shapeLegendH = 95; // panel height (rect is 90 + small padding)
  //   const legendGap = 0;

  const colorLegendY = shapeLegendY + shapeLegendH;

  drawMap(mapSvg, mapTransform, projectionWorld, pathWorld, worldYear);
  {
    const { ui } = ensureMapLayers(mapSvg);
    setTitleUILayer(
      ui,
      mapSvg,
      `Air Quality Stations - World - Year ${currentYear}`,
    );
    drawShapeLegend(ui, legendX, shapeLegendY);
    drawColorLegend(mapSvg, ui, legendX, colorLegendY);
  }

  drawBoxplot(boxG, xBox, yBox, worldYear);
  drawTrend(trendG, xTrend, yTrend, data);
  drawLegend(trendSvg, 420, 40);
  setTitle(
    boxSvg,
    `NO2 Distribution by Station Type - World - Year ${currentYear}`,
  );
  setTitle(trendSvg, `NO2 Trend by Station Type - World - All Years`);

  drawCountryComparison(worldYear);

  drawMap(germanySvg, germanyTransform, projectionDE, pathDE, deYear);
  {
    const { ui } = ensureMapLayers(germanySvg);
    setTitleUILayer(
      ui,
      germanySvg,
      `Air Quality Stations - Germany - Year ${currentYear}`,
    );
    drawShapeLegend(ui, legendX, shapeLegendY);
    drawColorLegend(germanySvg, ui, legendX, colorLegendY);
  }

  drawBoxplot(germanyBoxG, xBox, yBoxDE, deYear);
  drawTrend(germanyTrendG, xTrend, yTrendDE, deAllYears);
  drawLegend(germanyTrendSvg, 420, 40);
  setTitle(
    germanyBoxSvg,
    `NO2 Distribution by Station Type - Germany - Year ${currentYear}`,
  );
  setTitle(germanyTrendSvg, `NO2 Trend by Station Type - Germany - All Years`);
}

d3.select("#yearSlider").on("input", function () {
  currentYear = +this.value;
  d3.select("#yearLabel").text(currentYear);
  drawAll();
});
