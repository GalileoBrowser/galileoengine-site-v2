(function () {
  "use strict";

  var SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function svgElement(name, attributes, text) {
    var element = document.createElementNS(SVG_NAMESPACE, name);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, String(attributes[key]));
    });
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function isValidDate(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value + "T00:00:00Z"));
  }

  function validateTimeline(data) {
    if (!data || data.kind !== "galileo-project-evolution" || !Array.isArray(data.points) || data.points.length < 2) {
      throw new Error("At least two verified Galileo checkpoints are required.");
    }

    var previousDate = -Infinity;
    var previousSequence = 0;
    data.points.forEach(function (point, index) {
      var timestamp = isValidDate(point.date) ? Date.parse(point.date + "T00:00:00Z") : NaN;
      if (!Number.isFinite(timestamp) || timestamp <= previousDate) {
        throw new Error("Galileo checkpoint dates must be valid and strictly ordered.");
      }
      if (Number(point.sequence) !== index + 1 || Number(point.sequence) <= previousSequence) {
        throw new Error("Galileo checkpoint sequence is invalid.");
      }
      ["short_date", "category", "title", "summary", "commit", "evidence_url"].forEach(function (field) {
        if (typeof point[field] !== "string" || !point[field].trim()) {
          throw new Error("A Galileo checkpoint is missing " + field + ".");
        }
      });
      previousDate = timestamp;
      previousSequence = Number(point.sequence);
    });

    if (data.reviewed_through !== data.points[data.points.length - 1].date) {
      throw new Error("The reviewed-through date must match the latest checkpoint.");
    }
    return data;
  }

  function renderTimeline(container, data) {
    var width = 1160;
    var height = 500;
    var plot = { left: 104, right: 1080, top: 82, bottom: 360 };
    var points = data.points;
    var firstTime = Date.parse(points[0].date + "T00:00:00Z");
    var lastTime = Date.parse(points[points.length - 1].date + "T00:00:00Z");
    var span = lastTime - firstTime;

    function xPosition(point) {
      var timestamp = Date.parse(point.date + "T00:00:00Z");
      return plot.left + ((timestamp - firstTime) / span) * (plot.right - plot.left);
    }

    function yPosition(point) {
      return plot.bottom - ((Number(point.sequence) - 1) / (points.length - 1)) * (plot.bottom - plot.top);
    }

    function pathForTimeline() {
      return points.map(function (point, index) {
        return (index === 0 ? "M" : "L") + xPosition(point) + " " + yPosition(point);
      }).join(" ");
    }

    var svg = svgElement("svg", {
      viewBox: "0 0 " + width + " " + height,
      role: "img",
      "aria-labelledby": "evolution-svg-title evolution-svg-description",
    });
    svg.appendChild(svgElement("title", { id: "evolution-svg-title" }, "Galileo project evolution through 30 August 2026"));
    svg.appendChild(svgElement(
      "desc",
      { id: "evolution-svg-description" },
      "A chronological line joining seven evidence-backed Galileo checkpoints, from the standalone import on 26 July to the reviewed extension runtime source head on 30 August. The line orders checkpoints and is not a completion score."
    ));

    svg.appendChild(svgElement("text", {
      class: "evolution-chart__scale-title",
      x: plot.left,
      y: 30,
    }, "SELECTED EVIDENCE CHECKPOINTS · CHRONOLOGICAL ORDER"));
    svg.appendChild(svgElement("text", {
      class: "evolution-chart__boundary-label",
      x: plot.left - 18,
      y: plot.top + 4,
      "text-anchor": "end",
    }, "07 · CURRENT"));
    svg.appendChild(svgElement("text", {
      class: "evolution-chart__boundary-label",
      x: plot.left - 18,
      y: plot.bottom + 4,
      "text-anchor": "end",
    }, "01 · START"));

    points.forEach(function (point) {
      var x = xPosition(point);
      var y = yPosition(point);
      svg.appendChild(svgElement("line", {
        class: "evolution-chart__guide",
        x1: x,
        x2: x,
        y1: plot.top,
        y2: plot.bottom,
      }));
      svg.appendChild(svgElement("line", {
        class: "evolution-chart__grid-line",
        x1: plot.left,
        x2: plot.right,
        y1: y,
        y2: y,
      }));
    });

    svg.appendChild(svgElement("path", {
      class: "evolution-chart__series evolution-chart__series--galileo",
      d: pathForTimeline(),
    }));

    points.forEach(function (point, index) {
      var x = xPosition(point);
      var y = yPosition(point);
      var isLast = index === points.length - 1;
      var placeBelow = index % 2 === 0;
      var labelY = isLast ? y + 205 : (placeBelow ? y + 40 : y - 48);
      var anchor = index === 0 ? "start" : (isLast ? "end" : "middle");
      var group = svgElement("g", { class: "evolution-chart__checkpoint" + (isLast ? " is-current" : "") });

      group.appendChild(svgElement("line", {
        class: "evolution-chart__leader",
        x1: x,
        x2: x,
        y1: y + (placeBelow ? 12 : -12),
        y2: labelY + (placeBelow ? -15 : 14),
      }));
      group.appendChild(svgElement("text", {
        class: "evolution-chart__checkpoint-meta",
        x: x,
        y: labelY,
        "text-anchor": anchor,
      }, point.short_date.toUpperCase() + " · " + point.category.toUpperCase()));
      group.appendChild(svgElement("text", {
        class: "evolution-chart__checkpoint-title",
        x: x,
        y: labelY + 19,
        "text-anchor": anchor,
      }, point.title));
      group.appendChild(svgElement("text", {
        class: "evolution-chart__checkpoint-commit",
        x: x,
        y: labelY + 36,
        "text-anchor": anchor,
      }, point.commit));

      var circle = svgElement("circle", {
        class: "evolution-chart__point " + (isLast ? "evolution-chart__point--current" : "evolution-chart__point--galileo"),
        cx: x,
        cy: y,
        r: isLast ? 10 : 8,
      });
      circle.appendChild(svgElement("title", {}, point.short_date + ": " + point.title + " — " + point.summary));
      group.appendChild(circle);
      svg.appendChild(group);
    });

    svg.appendChild(svgElement("text", {
      class: "evolution-chart__axis-note",
      x: plot.right,
      y: height - 24,
      "text-anchor": "end",
    }, "POSITION ORDERS CHECKPOINTS · IT DOES NOT MEASURE COMPLETION"));

    container.replaceChildren(svg);
  }

  function renderTable(tableBody, data) {
    if (!tableBody) return;
    var fragment = document.createDocumentFragment();
    data.points.forEach(function (point) {
      var row = document.createElement("tr");
      var dateCell = document.createElement("th");
      dateCell.scope = "row";
      dateCell.textContent = point.short_date;

      var checkpointCell = document.createElement("td");
      checkpointCell.textContent = point.title;
      var category = document.createElement("small");
      category.textContent = point.category + " · " + point.summary;
      checkpointCell.appendChild(category);

      var evidenceCell = document.createElement("td");
      var link = document.createElement("a");
      link.href = point.evidence_url;
      link.textContent = point.commit;
      if (point.evidence_url.indexOf("https://") === 0) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      evidenceCell.appendChild(link);

      row.appendChild(dateCell);
      row.appendChild(checkpointCell);
      row.appendChild(evidenceCell);
      fragment.appendChild(row);
    });
    tableBody.replaceChildren(fragment);
  }

  function enhanceChart(figure) {
    var source = figure.dataset.source;
    var container = figure.querySelector("[data-evolution-plot]");
    var tableBody = figure.querySelector("[data-evolution-table]");
    var status = figure.querySelector("[data-evolution-status]");
    if (!source || !container) return;

    fetch(source, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Evidence request failed with HTTP " + response.status + ".");
        return response.json();
      })
      .then(validateTimeline)
      .then(function (data) {
        renderTimeline(container, data);
        renderTable(tableBody, data);
        figure.dataset.chartReady = "true";
        if (status) status.textContent = "Galileo timeline loaded through 30 August 2026.";
      })
      .catch(function () {
        figure.dataset.chartReady = "false";
        if (status) status.textContent = "The chart could not load. The retained evidence sections remain available on this page.";
      });
  }

  function enhanceCharts() {
    document.querySelectorAll("[data-evolution-chart]").forEach(enhanceChart);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceCharts);
  } else {
    enhanceCharts();
  }
})();
