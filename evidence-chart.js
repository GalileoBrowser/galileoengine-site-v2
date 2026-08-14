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

  function validateSeries(data) {
    if (!data || !data.metric || !Array.isArray(data.points) || data.points.length < 2) {
      throw new Error("At least two verified checkpoints are required.");
    }

    var denominator = Number(data.metric.denominator);
    if (!Number.isFinite(denominator) || denominator <= 0) {
      throw new Error("The chart denominator is invalid.");
    }

    data.points.forEach(function (point) {
      ["servo", "galileo"].forEach(function (project) {
        var passed = Number(point[project] && point[project].passed);
        if (!Number.isFinite(passed) || passed < 0 || passed > denominator) {
          throw new Error("A chart value is outside the declared denominator.");
        }
      });
    });

    return data;
  }

  function renderSeries(container, data) {
    var width = 1120;
    var height = 470;
    var plot = { left: 128, right: 1052, top: 72, bottom: 356 };
    var denominator = Number(data.metric.denominator);
    var points = data.points;
    var timeline = { left: 308, right: 1012 };

    function xPosition(index) {
      if (points.length === 1) return (timeline.left + timeline.right) / 2;
      return timeline.left + ((timeline.right - timeline.left) * index) / (points.length - 1);
    }

    function yPosition(value) {
      return plot.bottom - (Number(value) / denominator) * (plot.bottom - plot.top);
    }

    function pathFor(project) {
      var path = "M" + xPosition(0) + " " + yPosition(points[0][project].passed);
      points.slice(1).forEach(function (point, offset) {
        var index = offset + 1;
        var previousX = xPosition(index - 1);
        var previousY = yPosition(points[index - 1][project].passed);
        var x = xPosition(index);
        var y = yPosition(point[project].passed);
        var midpoint = previousX + (x - previousX) * 0.5;
        path += " C" + midpoint + " " + previousY + " " + midpoint + " " + y + " " + x + " " + y;
      });
      return path;
    }

    function shortCommit(project) {
      return String(project.source_commit || "unrecorded").slice(0, 12);
    }

    function annotation(x, y, anchor, label, value, detail, modifier) {
      var group = svgElement("g", { class: "evolution-chart__annotation " + modifier });
      group.appendChild(svgElement("text", {
        class: "evolution-chart__annotation-label",
        x: x,
        y: y,
        "text-anchor": anchor,
      }, label));
      group.appendChild(svgElement("text", {
        class: "evolution-chart__annotation-value",
        x: x,
        y: y + 19,
        "text-anchor": anchor,
      }, value));
      group.appendChild(svgElement("text", {
        class: "evolution-chart__annotation-detail",
        x: x,
        y: y + 36,
        "text-anchor": anchor,
      }, detail));
      return group;
    }

    var svg = svgElement("svg", {
      viewBox: "0 0 " + width + " " + height,
      role: "img",
      "aria-labelledby": "evolution-svg-title evolution-svg-description",
    });

    svg.appendChild(svgElement("title", { id: "evolution-svg-title" }, "Servo and GalileoEngine Phase 0 Core history"));
    svg.appendChild(svgElement(
      "desc",
      { id: "evolution-svg-description" },
      "Both projects begin at 246 of 286 passing subtests at the verified Servo fork commit. At the next verified checkpoint Servo remains at 246 and GalileoEngine reaches 286."
    ));

    svg.appendChild(svgElement("text", {
      class: "evolution-chart__scale-title",
      x: plot.left,
      y: 34,
    }, "PASSED SUBTESTS · FIXED SCALE 0–" + denominator));

    var ticks = [0, Math.round(denominator / 2), denominator];
    ticks.forEach(function (tick) {
      var y = yPosition(tick);
      svg.appendChild(svgElement("line", {
        class: "evolution-chart__grid-line",
        x1: plot.left,
        x2: plot.right,
        y1: y,
        y2: y,
      }));
      svg.appendChild(svgElement("text", {
        class: "evolution-chart__axis-label",
        x: plot.left - 18,
        y: y + 4,
        "text-anchor": "end",
      }, String(tick)));
    });

    for (var guideIndex = 0; guideIndex <= 7; guideIndex += 1) {
      var guideX = plot.left + ((plot.right - plot.left) * guideIndex) / 7;
      svg.appendChild(svgElement("line", {
        class: "evolution-chart__guide",
        x1: guideX,
        x2: guideX,
        y1: plot.top,
        y2: plot.bottom,
      }));
    }

    points.forEach(function (point, index) {
      var x = xPosition(index);
      svg.appendChild(svgElement("text", {
        class: "evolution-chart__date",
        x: x,
        y: plot.bottom + 42,
        "text-anchor": index === 0 ? "start" : index === points.length - 1 ? "end" : "middle",
      }, point.label));
      svg.appendChild(svgElement("text", {
        class: "evolution-chart__milestone",
        x: x,
        y: plot.bottom + 61,
        "text-anchor": index === 0 ? "start" : index === points.length - 1 ? "end" : "middle",
      }, point.milestone));
    });

    svg.appendChild(svgElement("path", {
      class: "evolution-chart__series evolution-chart__series--servo",
      d: pathFor("servo"),
    }));
    svg.appendChild(svgElement("path", {
      class: "evolution-chart__series evolution-chart__series--galileo",
      d: pathFor("galileo"),
    }));

    points.forEach(function (point, index) {
      if (index === 0) return;
      ["servo", "galileo"].forEach(function (project) {
        var circle = svgElement("circle", {
          class: "evolution-chart__point evolution-chart__point--" + project,
          cx: xPosition(index),
          cy: yPosition(point[project].passed),
          r: 7,
        });
        circle.appendChild(svgElement(
          "title",
          {},
          (project === "servo" ? "Servo" : "GalileoEngine") + ": " + point[project].passed + " of " + denominator + " passed, " + point.label
        ));
        svg.appendChild(circle);
      });
    });

    var firstPoint = points[0];
    var lastPoint = points[points.length - 1];
    var forkX = xPosition(0);
    var forkY = yPosition(firstPoint.servo.passed);
    var latestX = xPosition(points.length - 1);
    var servoY = yPosition(lastPoint.servo.passed);
    var galileoY = yPosition(lastPoint.galileo.passed);

    svg.appendChild(svgElement("circle", {
      class: "evolution-chart__point evolution-chart__point--fork",
      cx: forkX,
      cy: forkY,
      r: 8,
    }));
    svg.appendChild(svgElement("circle", {
      class: "evolution-chart__fork-ring",
      cx: forkX,
      cy: forkY,
      r: 16,
    }));

    var delta = Number(lastPoint.galileo.passed) - Number(firstPoint.galileo.passed);
    var deltaX = forkX + (latestX - forkX) * 0.58;
    var deltaY = forkY + (galileoY - forkY) * 0.53;
    svg.appendChild(svgElement("rect", {
      class: "evolution-chart__delta-pill",
      x: deltaX - 55,
      y: deltaY - 16,
      width: 110,
      height: 25,
      rx: 12.5,
    }));
    svg.appendChild(svgElement("text", {
      class: "evolution-chart__delta-text",
      x: deltaX,
      y: deltaY + 1,
      "text-anchor": "middle",
    }, (delta >= 0 ? "+" : "") + delta + " SUBTESTS"));

    svg.appendChild(annotation(
      forkX - 132,
      forkY + 48,
      "start",
      "SHARED BASELINE · " + firstPoint.label.toUpperCase(),
      firstPoint.servo.passed + " / " + denominator,
      shortCommit(firstPoint.servo) + " · inherited identical source",
      "evolution-chart__annotation--fork"
    ));
    svg.appendChild(annotation(
      latestX,
      22,
      "end",
      "GALILEOENGINE · " + lastPoint.label.toUpperCase(),
      lastPoint.galileo.passed + " / " + denominator,
      shortCommit(lastPoint.galileo) + " · retained report",
      "evolution-chart__annotation--galileo"
    ));
    svg.appendChild(annotation(
      latestX,
      servoY + 42,
      "end",
      "SERVO · " + lastPoint.label.toUpperCase(),
      lastPoint.servo.passed + " / " + denominator,
      shortCommit(lastPoint.servo) + " · official Actions artefact",
      "evolution-chart__annotation--servo"
    ));

    container.replaceChildren(svg);
  }

  function enhanceChart(figure) {
    var source = figure.dataset.source;
    var container = figure.querySelector("[data-evolution-plot]");
    var status = figure.querySelector("[data-evolution-status]");
    if (!source || !container) return;

    fetch(source, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Evidence request failed with HTTP " + response.status + ".");
        return response.json();
      })
      .then(validateSeries)
      .then(function (data) {
        renderSeries(container, data);
        figure.dataset.chartReady = "true";
        if (status) status.textContent = "Verified chart loaded.";
      })
      .catch(function () {
        figure.dataset.chartReady = "false";
        if (status) status.textContent = "The chart could not load. The verified evidence table remains available below.";
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
