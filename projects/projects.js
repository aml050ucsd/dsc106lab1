import { fetchJSON, renderProjects } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const projects = await fetchJSON("../lib/projects.json");
const projectsContainer = document.querySelector(".projects");
const title = document.querySelector(".projects-title");
const searchInput = document.querySelector(".searchBar");

const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
const colors = d3.scaleOrdinal(d3.schemeTableau10);

let query = "";
let selectedYear = null;
let pieData = [];

function getSearchFilteredProjects() {
    return projects.filter((p) => {
        const values = Object.values(p).join("\n").toLowerCase();
        return values.includes(query.toLowerCase());
    });
}

function getVisibleProjects() {
    let visible = getSearchFilteredProjects();
    if (selectedYear !== null) {
        visible = visible.filter((p) => p.year === selectedYear);
    }
    return visible;
}

function updateSelectionClasses() {
    d3.select("#projects-pie-plot")
        .selectAll("path")
        .attr("class", (_, i) =>
            pieData[i] && pieData[i].label === selectedYear ? "selected" : "",
        );
    d3.select(".legend")
        .selectAll("li")
        .attr("class", (_, i) =>
            pieData[i] && pieData[i].label === selectedYear
                ? "legend-item selected"
                : "legend-item",
        );
}

function toggleYear(year) {
    selectedYear = selectedYear === year ? null : year;
    updateSelectionClasses();
    applyFiltersAndRenderProjects();
}

function applyFiltersAndRenderProjects() {
    const visible = getVisibleProjects();
    renderProjects(visible, projectsContainer, "h2");
    if (title) title.textContent = `Projects (${visible.length})`;
}

function renderPieChart(projectsGiven) {
    const rolledData = d3.rollups(projectsGiven, (v) => v.length, (d) => d.year);
    pieData = rolledData.map(([year, count]) => ({ value: count, label: year }));
    pieData.sort((a, b) => a.label - b.label);

    const sliceGenerator = d3.pie().value((d) => d.value);
    const arcData = sliceGenerator(pieData);
    const arcs = arcData.map((d) => arcGenerator(d));

    const svg = d3.select("#projects-pie-plot");
    const legend = d3.select(".legend");
    svg.selectAll("path").remove();
    legend.selectAll("li").remove();

    arcs.forEach((arc, i) => {
        svg.append("path")
            .attr("d", arc)
            .attr("fill", colors(pieData[i].label))
            .attr("class", pieData[i].label === selectedYear ? "selected" : "")
            .on("click", () => toggleYear(pieData[i].label));
    });

    pieData.forEach((d, i) => {
        legend.append("li")
            .attr("class", pieData[i].label === selectedYear ? "legend-item selected" : "legend-item")
            .attr("style", `--color:${colors(pieData[i].label)}`)
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
            .on("click", () => toggleYear(pieData[i].label));
    });
}

searchInput.addEventListener("input", (event) => {
    query = event.target.value;
    renderPieChart(getSearchFilteredProjects());
    applyFiltersAndRenderProjects();
});

renderPieChart(getSearchFilteredProjects());
applyFiltersAndRenderProjects();
