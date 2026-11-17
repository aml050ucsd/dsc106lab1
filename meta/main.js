import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import scrollama from "https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm";

let xScale;
let yScale;

async function loadData() {
    const data = await d3.csv("loc.csv", (row) => ({
        ...row,
        line: Number(row.line),
        depth: Number(row.depth),
        length: Number(row.length),
        date: new Date(row.date + "T00:00" + row.timezone),
        datetime: new Date(row.datetime),
    }));
    return data;
}

function processCommits(data) {
    return d3
        .groups(data, (d) => d.commit)
        .map(([commit, lines]) => {
            const first = lines[0];
            const { author, date, time, timezone, datetime } = first;
            const ret = {
                id: commit,
                url: `https://github.com/aml050ucsd/dsc106lab1/commit/${commit}`,
                author, date, time, timezone, datetime,
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
            };
            Object.defineProperty(ret, "lines", {
                value: lines,
                writable: false,
                enumerable: false,
                configurable: true,
            });
            return ret;
        })
        .sort((a, b) => a.datetime - b.datetime);
}

function renderCommitInfo(data, commits) {
    const container = d3.select("#stats");
    container.html("");
    const dl = container.append("dl").attr("class", "stats");

    dl.append("dt").html('Total <abbr title="Lines of code">LOC</abbr>');
    dl.append("dd").text(data.length);

    dl.append("dt").text("Total commits");
    dl.append("dd").text(commits.length);

    const numFiles = d3.group(data, (d) => d.file).size;
    dl.append("dt").text("Files");
    dl.append("dd").text(numFiles);

    const fileLengths = d3.rollups(data, (v) => d3.max(v, (d) => d.line), (d) => d.file);
    const longest = d3.greatest(fileLengths, (d) => d[1]);
    dl.append("dt").text("Longest file");
    dl.append("dd").text(longest ? `${longest[0]} (${longest[1]} lines)` : "—");

    const avgLineLen = Math.round(d3.mean(data, (d) => d.length)) || 0;
    dl.append("dt").text("Avg. line length");
    dl.append("dd").text(`${avgLineLen} chars`);

    dl.append("dt").text("Max depth");
    dl.append("dd").text(d3.max(data, (d) => d.depth) ?? "—");

    const workByPeriod = d3.rollups(data, (v) => v.length,
        (d) => d.datetime.toLocaleString("en", { dayPeriod: "short" }));
    dl.append("dt").text("Most productive time");
    dl.append("dd").text(d3.greatest(workByPeriod, (d) => d[1])?.[0] ?? "—");

    const workByDay = d3.rollups(data, (v) => v.length,
        (d) => d.datetime.toLocaleString("en", { weekday: "long" }));
    dl.append("dt").text("Most productive day");
    dl.append("dd").text(d3.greatest(workByDay, (d) => d[1])?.[0] ?? "—");
}

function renderTooltipContent(commit) {
    if (!commit || Object.keys(commit).length === 0) return;
    document.getElementById("commit-link").href = commit.url;
    document.getElementById("commit-link").textContent = commit.id.slice(0, 7);
    document.getElementById("commit-date").textContent =
        commit.datetime?.toLocaleString("en", { dateStyle: "full" });
    document.getElementById("commit-time-label").textContent =
        commit.datetime?.toLocaleString("en", { timeStyle: "short" });
    document.getElementById("commit-author").textContent = commit.author;
    document.getElementById("commit-lines").textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
    document.getElementById("commit-tooltip").hidden = !isVisible;
}

function updateTooltipPosition(event) {
    const tooltip = document.getElementById("commit-tooltip");
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
}

function isCommitSelected(selection, commit) {
    if (!selection) return false;
    const [[x0, y0], [x1, y1]] = selection;
    const cx = xScale(commit.datetime);
    const cy = yScale(commit.hourFrac);
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
}

function renderSelectionCount(selection) {
    const selected = selection
        ? filteredCommits.filter((d) => isCommitSelected(selection, d))
        : [];
    document.querySelector("#selection-count").textContent =
        `${selected.length || "No"} commits selected`;
    return selected;
}

function renderLanguageBreakdown(selection) {
    const selected = selection
        ? filteredCommits.filter((d) => isCommitSelected(selection, d))
        : [];
    const container = document.getElementById("language-breakdown");
    if (selected.length === 0) { container.innerHTML = ""; return; }

    const lines = selected.flatMap((d) => d.lines);
    const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);

    container.innerHTML = "";
    for (const [language, count] of breakdown) {
        const formatted = d3.format(".1~%")(count / lines.length);
        container.innerHTML += `<dt>${language}</dt><dd>${count} lines (${formatted})</dd>`;
    }
}

function brushed(event) {
    const selection = event.selection;
    d3.selectAll(".dots circle").classed("selected", (d) => isCommitSelected(selection, d));
    renderSelectionCount(selection);
    renderLanguageBreakdown(selection);
}

function createBrushSelector(svg) {
    svg.call(d3.brush().on("start brush end", brushed));
    svg.selectAll(".dots, .overlay ~ *").raise();
}

function renderScatterPlot(data, commits) {
    const width = 1000, height = 600;
    const margin = { top: 10, right: 10, bottom: 30, left: 42 };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3.select("#chart").append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("overflow", "visible");

    xScale = d3.scaleTime()
        .domain(d3.extent(commits, (d) => d.datetime))
        .range([usableArea.left, usableArea.right]).nice();

    yScale = d3.scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]);

    const hourColor = d3.scaleLinear()
        .domain([0, 6, 12, 18, 24])
        .range(["#0f172a", "#3b82f6", "#fbbf24", "#f97316", "#0f172a"])
        .interpolate(d3.interpolateHcl);

    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 20]);

    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    svg.append("g").attr("class", "gridlines")
        .attr("transform", `translate(${usableArea.left}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat("").tickSize(-usableArea.width));

    const dots = svg.append("g").attr("class", "dots");
    dots.selectAll("circle")
        .data(sortedCommits, (d) => d.id)
        .join("circle")
        .attr("cx", (d) => xScale(d.datetime))
        .attr("cy", (d) => yScale(d.hourFrac))
        .attr("r", (d) => rScale(d.totalLines))
        .attr("fill", (d) => hourColor(d.hourFrac))
        .style("fill-opacity", 0.7)
        .on("mouseenter", (event, commit) => {
            d3.select(event.currentTarget).style("fill-opacity", 1);
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on("mouseleave", (event) => {
            d3.select(event.currentTarget).style("fill-opacity", 0.7);
            updateTooltipVisibility(false);
        });

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");

    svg.append("g")
        .attr("transform", `translate(0, ${usableArea.bottom})`)
        .attr("class", "x-axis").call(xAxis);

    svg.append("g")
        .attr("transform", `translate(${usableArea.left}, 0)`)
        .attr("class", "y-axis").call(yAxis);

    createBrushSelector(svg);
}

function updateScatterPlot(data, commits) {
    const width = 1000, height = 600;
    const margin = { top: 10, right: 10, bottom: 30, left: 42 };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3.select("#chart").select("svg");
    if (svg.empty()) return;

    if (commits.length > 0) {
        xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));
    }

    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 20]);

    const hourColor = d3.scaleLinear()
        .domain([0, 6, 12, 18, 24])
        .range(["#0f172a", "#3b82f6", "#fbbf24", "#f97316", "#0f172a"])
        .interpolate(d3.interpolateHcl);

    const xAxisGroup = svg.select("g.x-axis");
    xAxisGroup.selectAll("*").remove();
    xAxisGroup.call(d3.axisBottom(xScale));

    const dots = svg.select("g.dots");
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    dots.selectAll("circle")
        .data(sortedCommits, (d) => d.id)
        .join("circle")
        .attr("cx", (d) => xScale(d.datetime))
        .attr("cy", (d) => yScale(d.hourFrac))
        .attr("r", (d) => rScale(d.totalLines))
        .attr("fill", (d) => hourColor(d.hourFrac))
        .style("fill-opacity", 0.7)
        .on("mouseenter", (event, commit) => {
            d3.select(event.currentTarget).style("fill-opacity", 1);
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on("mouseleave", (event) => {
            d3.select(event.currentTarget).style("fill-opacity", 0.7);
            updateTooltipVisibility(false);
        });
}

function updateFileDisplay(filteredCommits) {
    let lines = filteredCommits.flatMap((d) => d.lines);

    let files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => ({ name, lines }))
        .sort((a, b) => b.lines.length - a.lines.length);

    let colors = d3.scaleOrdinal(d3.schemeTableau10);

    let filesContainer = d3.select("#files")
        .selectAll("div")
        .data(files, (d) => d.name)
        .join((enter) =>
            enter.append("div").call((div) => {
                div.append("dt").append("code");
                div.append("dd");
            }),
        );

    filesContainer.select("dt")
        .html((d) => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

    filesContainer.select("dd")
        .selectAll("div")
        .data((d) => d.lines, (line) => `${line.commit}:${line.file}:${line.line}`)
        .join("div")
        .attr("class", "loc")
        .attr("style", (d) => `--color: ${colors(d.type)}`);
}

const data = await loadData();
const commits = processCommits(data);

const timeScale = d3.scaleTime()
    .domain([
        d3.min(commits, (d) => d.datetime),
        d3.max(commits, (d) => d.datetime),
    ])
    .range([0, 100]);

let commitMaxTime   = d3.max(commits, (d) => d.datetime);
let filteredCommits = commits;
let filteredData    = data;

function applyCommitFilter(maxTime) {
    commitMaxTime = maxTime;

    document.getElementById("commit-time").textContent =
        maxTime.toLocaleString("en", {
            dateStyle: "long",
            timeStyle: "short",
        });

    filteredCommits = commits.filter((d) => d.datetime <= maxTime);
    filteredData    = data.filter((d) => d.datetime <= maxTime);

    updateScatterPlot(data, filteredCommits);
    renderCommitInfo(filteredData, filteredCommits);
    updateFileDisplay(filteredCommits);
}

function commitStepHTML(d, i) {
    return `
        On ${d.datetime.toLocaleString("en", {
            dateStyle: "full",
            timeStyle: "short",
        })},
        I made <a href="${d.url}" target="_blank">${
            i > 0 ? "another glorious commit" : "my first commit, and it was glorious"
        }</a>.
        I edited ${d.totalLines} lines across ${
            d3.rollups(d.lines, (D) => D.length, (d) => d.file).length
        } files.
        Then I looked over all I had made, and I saw that it was very good.
    `;
}

d3.select("#scatter-story")
    .selectAll(".step")
    .data(commits)
    .join("div")
    .attr("class", "step")
    .html(commitStepHTML);

function onStepEnter(response) {
    applyCommitFilter(response.element.__data__.datetime);
}

const scroller = scrollama();
scroller
    .setup({ container: "#scrolly-1", step: "#scrolly-1 .step" })
    .onStepEnter(onStepEnter);

window.addEventListener("resize", () => scroller.resize());

renderScatterPlot(data, commits);
applyCommitFilter(commitMaxTime);
