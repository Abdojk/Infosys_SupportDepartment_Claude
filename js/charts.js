/* ===================================================
   charts.js — Dashboard chart visualizations (Chart.js)
   Depends on: api.js, utils.js, Chart.js loaded via CDN
   =================================================== */

const Charts = (() => {
    "use strict";

    const COLORS = {
        primary: "#0078d4",
        primaryLight: "#deecf9",
        success: "#107c10",
        successLight: "#dff6dd",
        warning: "#ff8c00",
        warningLight: "#fff4ce",
        danger: "#d13438",
        dangerLight: "#fed9cc",
        grey: "#a19f9d",
        greyLight: "#edebe9",
    };

    let chartInstances = {};

    /**
     * Initialise all dashboard charts.
     */
    async function init() {
        Chart.defaults.font.family =
            '"Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", sans-serif';
        Chart.defaults.font.size = 13;
        Chart.defaults.color = "#605e5c";

        await Promise.all([
            renderCasesByStatusChart(),
            renderCasesByPriorityChart(),
            renderCaseTrendChart(),
            renderTimesheetChart(),
        ]);
    }

    /**
     * Destroy all existing chart instances (for re-renders).
     */
    function destroyAll() {
        Object.values(chartInstances).forEach((c) => c.destroy());
        chartInstances = {};
    }

    /**
     * Render a chart to all matching canvas IDs. Fetches data once, renders to each.
     */
    function renderToAll(canvasIds, makeChart) {
        const targets = canvasIds.map((id) => document.getElementById(id)).filter(Boolean);
        if (targets.length === 0) return Promise.resolve();
        return makeChart(targets);
    }

    /**
     * Cases by Status — doughnut chart.
     */
    async function renderCasesByStatusChart() {
        await renderToAll(["chart-cases-status", "chart-analytics-status"], async (targets) => {
            try {
                const [active, resolved, cancelled] = await Promise.all([
                    Api.getCount("incidents", "statuscode eq 1"),
                    Api.getCount("incidents", "statuscode eq 2"),
                    Api.getCount("incidents", "statuscode eq 3"),
                ]);

                targets.forEach((canvas) => {
                    if (chartInstances[canvas.id]) chartInstances[canvas.id].destroy();
                    chartInstances[canvas.id] = new Chart(canvas, {
                        type: "doughnut",
                        data: {
                            labels: ["Active", "Resolved", "Cancelled"],
                            datasets: [{
                                data: [active, resolved, cancelled],
                                backgroundColor: [COLORS.primary, COLORS.success, COLORS.grey],
                                borderWidth: 0,
                                hoverOffset: 4,
                            }],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: "65%",
                            plugins: {
                                legend: {
                                    position: "bottom",
                                    labels: { padding: 16, usePointStyle: true, pointStyleWidth: 10 },
                                },
                            },
                        },
                    });
                });
            } catch (err) {
                targets.forEach((c) => showChartError(c, err.message));
            }
        });
    }

    /**
     * Cases by Priority — horizontal bar chart.
     */
    async function renderCasesByPriorityChart() {
        await renderToAll(["chart-cases-priority", "chart-analytics-priority"], async (targets) => {
            try {
                const [high, medium, low] = await Promise.all([
                    Api.getCount("incidents", "prioritycode eq 1 and statuscode eq 1"),
                    Api.getCount("incidents", "prioritycode eq 2 and statuscode eq 1"),
                    Api.getCount("incidents", "prioritycode eq 3 and statuscode eq 1"),
                ]);

                targets.forEach((canvas) => {
                    if (chartInstances[canvas.id]) chartInstances[canvas.id].destroy();
                    chartInstances[canvas.id] = new Chart(canvas, {
                        type: "bar",
                        data: {
                            labels: ["High", "Medium", "Low"],
                            datasets: [{
                                label: "Active Cases",
                                data: [high, medium, low],
                                backgroundColor: [COLORS.danger, COLORS.warning, COLORS.success],
                                borderRadius: 4,
                                barThickness: 28,
                            }],
                        },
                        options: {
                            indexAxis: "y",
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#edebe9" } },
                                y: { grid: { display: false } },
                            },
                        },
                    });
                });
            } catch (err) {
                targets.forEach((c) => showChartError(c, err.message));
            }
        });
    }

    /**
     * Case Trend — line chart showing cases created over past 7 days.
     */
    async function renderCaseTrendChart() {
        await renderToAll(["chart-case-trend", "chart-analytics-trend"], async (targets) => {
            try {
                const days = 7;
                const labels = [];
                const promises = [];

                for (let i = days - 1; i >= 0; i--) {
                    const date = new Date();
                    date.setDate(date.getDate() - i);
                    const dayStr = date.toISOString().split("T")[0];
                    const nextDate = new Date(date);
                    nextDate.setDate(nextDate.getDate() + 1);
                    const nextStr = nextDate.toISOString().split("T")[0];

                    labels.push(
                        date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                    );
                    promises.push(
                        Api.getCount("incidents", `createdon ge ${dayStr} and createdon lt ${nextStr}`)
                    );
                }

                const data = await Promise.all(promises);

                targets.forEach((canvas) => {
                    if (chartInstances[canvas.id]) chartInstances[canvas.id].destroy();
                    chartInstances[canvas.id] = new Chart(canvas, {
                        type: "line",
                        data: {
                            labels: [...labels],
                            datasets: [{
                                label: "Cases Created",
                                data: [...data],
                                borderColor: COLORS.primary,
                                backgroundColor: COLORS.primaryLight,
                                fill: true,
                                tension: 0.3,
                                pointRadius: 4,
                                pointHoverRadius: 6,
                            }],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#edebe9" } },
                                x: { grid: { display: false } },
                            },
                        },
                    });
                });
            } catch (err) {
                targets.forEach((c) => showChartError(c, err.message));
            }
        });
    }

    /**
     * Weekly Hours — bar chart showing hours logged per day this week.
     */
    async function renderTimesheetChart() {
        const canvas = document.getElementById("chart-timesheet");
        if (!canvas) return;

        try {
            const monday = getMonday(new Date());
            const labels = [];
            const data = [];
            const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

            for (let i = 0; i < 7; i++) {
                const date = new Date(monday);
                date.setDate(date.getDate() + i);
                labels.push(dayNames[i]);

                const dayStr = date.toISOString().split("T")[0];
                const nextDate = new Date(date);
                nextDate.setDate(nextDate.getDate() + 1);
                const nextStr = nextDate.toISOString().split("T")[0];

                const entries = await Api.getTimesheets(
                    `$filter=inf_date ge ${dayStr} and inf_date lt ${nextStr}&$select=inf_duration`
                );
                const totalHours = entries.reduce((s, e) => s + (e.inf_duration || 0), 0) / 60;
                data.push(Math.round(totalHours * 10) / 10);
            }

            if (chartInstances["timesheet"]) chartInstances["timesheet"].destroy();

            chartInstances["timesheet"] = new Chart(canvas, {
                type: "bar",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "Hours",
                            data,
                            backgroundColor: COLORS.primary,
                            borderRadius: 4,
                            barThickness: 28,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: "Hours" },
                            grid: { color: "#edebe9" },
                        },
                        x: {
                            grid: { display: false },
                        },
                    },
                },
            });
        } catch (err) {
            showChartError(canvas, err.message);
        }
    }

    /**
     * Helper to get the Monday of the current week.
     */
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Display a simple error message in place of a chart.
     */
    function showChartError(canvas, message) {
        const wrapper = canvas.parentElement;
        if (wrapper) {
            wrapper.innerHTML = `<p class="text-danger" style="padding:1rem;text-align:center;font-size:var(--font-size-sm)">Chart error: ${Utils.escapeHtml(message)}</p>`;
        }
    }

    return {
        init,
        destroyAll,
    };
})();
