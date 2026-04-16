/* ===================================================
   cases.js — Support case management UI module
   Depends on: api.js, utils.js
   =================================================== */

const Cases = (() => {
    "use strict";

    // D365 incident status codes
    const STATUS_MAP = {
        1: "Active",
        2: "Resolved",
        3: "Cancelled",
    };

    const PRIORITY_MAP = {
        1: "High",
        2: "Medium",
        3: "Low",
    };

    let currentPage = 1;
    const PAGE_SIZE = 20;
    let currentFilter = { status: "", priority: "", search: "" };

    /**
     * Initialise the cases view — fetch and render.
     */
    async function init() {
        bindEvents();
        await loadCases();
    }

    /**
     * Wire up filter, search, and action events.
     */
    function bindEvents() {
        const statusFilter = document.getElementById("filter-status");
        const priorityFilter = document.getElementById("filter-priority");
        const searchInput = document.getElementById("case-search");
        const newCaseBtn = document.getElementById("btn-new-case");

        if (statusFilter) {
            statusFilter.addEventListener("change", (e) => {
                currentFilter.status = e.target.value;
                currentPage = 1;
                loadCases();
            });
        }

        if (priorityFilter) {
            priorityFilter.addEventListener("change", (e) => {
                currentFilter.priority = e.target.value;
                currentPage = 1;
                loadCases();
            });
        }

        if (searchInput) {
            searchInput.addEventListener(
                "input",
                Utils.debounce((e) => {
                    currentFilter.search = e.target.value.trim();
                    currentPage = 1;
                    loadCases();
                }, 400)
            );
        }

        if (newCaseBtn) {
            newCaseBtn.addEventListener("click", openNewCaseModal);
        }
    }

    /**
     * Build the OData query from current filters.
     */
    function buildQuery() {
        const filters = [];
        if (currentFilter.status) {
            filters.push(`statuscode eq ${currentFilter.status}`);
        }
        if (currentFilter.priority) {
            filters.push(`prioritycode eq ${currentFilter.priority}`);
        }
        if (currentFilter.search) {
            const sanitized = currentFilter.search.replace(/'/g, "''");
            filters.push(`contains(title,'${sanitized}')`);
        }

        const parts = [
            "$select=incidentid,title,ticketnumber,statuscode,prioritycode,createdon,modifiedon",
            "$expand=customerid_contact($select=fullname)",
            `$orderby=createdon desc`,
            `$top=${PAGE_SIZE}`,
            `$skip=${(currentPage - 1) * PAGE_SIZE}`,
            "$count=true",
        ];

        if (filters.length > 0) {
            parts.push(`$filter=${filters.join(" and ")}`);
        }

        return parts.join("&");
    }

    /**
     * Fetch cases from D365 and render the table.
     */
    async function loadCases() {
        const tableBody = document.getElementById("cases-table-body");
        const countEl = document.getElementById("cases-count");
        if (!tableBody) return;

        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem"><div class="spinner"></div></td></tr>`;

        try {
            const query = buildQuery();
            const cases = await Api.getCases(query);
            renderTable(cases, tableBody);
            if (countEl) {
                countEl.textContent = `${cases.length} case${cases.length !== 1 ? "s" : ""} shown`;
            }
        } catch (err) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-danger" style="text-align:center;padding:2rem">Failed to load cases: ${Utils.escapeHtml(err.message)}</td></tr>`;
            Utils.showToast("Failed to load cases", "error");
        }
    }

    /**
     * Render rows into the cases table.
     */
    function renderTable(cases, tbody) {
        if (cases.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6">
                    <div class="empty-state">
                        <div class="empty-state__icon">&#128194;</div>
                        <div class="empty-state__text">No cases found</div>
                    </div>
                </td></tr>`;
            return;
        }

        tbody.innerHTML = cases
            .map((c) => {
                const status = STATUS_MAP[c.statuscode] || "Unknown";
                const priority = PRIORITY_MAP[c.prioritycode] || "—";
                const customer = c.customerid_contact?.fullname || "—";
                return `
                <tr data-id="${c.incidentid}">
                    <td><a href="#" class="case-link" data-id="${c.incidentid}">${Utils.escapeHtml(c.ticketnumber)}</a></td>
                    <td class="truncate" style="max-width:280px">${Utils.escapeHtml(c.title)}</td>
                    <td>${Utils.escapeHtml(customer)}</td>
                    <td><span class="badge ${Utils.statusBadgeClass(status)}">${status}</span></td>
                    <td><span class="badge ${Utils.priorityBadgeClass(priority)}">${priority}</span></td>
                    <td>${Utils.timeAgo(c.createdon)}</td>
                </tr>`;
            })
            .join("");

        tbody.querySelectorAll(".case-link").forEach((link) => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                openCaseDetail(link.dataset.id);
            });
        });
    }

    /**
     * Open the case detail modal.
     */
    async function openCaseDetail(id) {
        const backdrop = document.getElementById("modal-backdrop");
        const modalBody = document.getElementById("modal-body");
        const modalTitle = document.getElementById("modal-title");
        if (!backdrop || !modalBody) return;

        modalTitle.textContent = "Case Detail";
        modalBody.innerHTML = `<div style="text-align:center;padding:2rem"><div class="spinner"></div></div>`;
        backdrop.classList.add("active");

        try {
            const c = await Api.getCase(id);
            const status = STATUS_MAP[c.statuscode] || "Unknown";
            const priority = PRIORITY_MAP[c.prioritycode] || "—";

            modalBody.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:var(--spacing-md)">
                    <div class="form-group">
                        <label>Ticket</label>
                        <div>${Utils.escapeHtml(c.ticketnumber)}</div>
                    </div>
                    <div class="form-group">
                        <label>Title</label>
                        <div>${Utils.escapeHtml(c.title)}</div>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <div>${Utils.escapeHtml(c.description || "No description")}</div>
                    </div>
                    <div style="display:flex;gap:var(--spacing-lg)">
                        <div class="form-group" style="flex:1">
                            <label>Status</label>
                            <span class="badge ${Utils.statusBadgeClass(status)}">${status}</span>
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Priority</label>
                            <span class="badge ${Utils.priorityBadgeClass(priority)}">${priority}</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:var(--spacing-lg)">
                        <div class="form-group" style="flex:1">
                            <label>Created</label>
                            <div>${Utils.formatDate(c.createdon)}</div>
                        </div>
                        <div class="form-group" style="flex:1">
                            <label>Last Updated</label>
                            <div>${Utils.formatDate(c.modifiedon)}</div>
                        </div>
                    </div>
                </div>`;
        } catch (err) {
            modalBody.innerHTML = `<p class="text-danger">Failed to load case: ${Utils.escapeHtml(err.message)}</p>`;
        }
    }

    /**
     * Open the "New Case" modal with a creation form.
     */
    function openNewCaseModal() {
        const backdrop = document.getElementById("modal-backdrop");
        const modalBody = document.getElementById("modal-body");
        const modalTitle = document.getElementById("modal-title");
        if (!backdrop || !modalBody) return;

        modalTitle.textContent = "New Case";
        modalBody.innerHTML = `
            <form id="new-case-form" class="login-card__form">
                <div class="form-group">
                    <label for="nc-title">Title *</label>
                    <input id="nc-title" class="form-control" required placeholder="Brief case summary">
                </div>
                <div class="form-group">
                    <label for="nc-description">Description</label>
                    <textarea id="nc-description" class="form-control" rows="4" placeholder="Detailed description of the issue"></textarea>
                </div>
                <div class="form-group">
                    <label for="nc-priority">Priority</label>
                    <select id="nc-priority" class="form-control">
                        <option value="2">Medium</option>
                        <option value="1">High</option>
                        <option value="3">Low</option>
                    </select>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:var(--spacing-sm);margin-top:var(--spacing-sm)">
                    <button type="button" class="btn btn--secondary" id="nc-cancel">Cancel</button>
                    <button type="submit" class="btn btn--primary">Create Case</button>
                </div>
            </form>`;

        backdrop.classList.add("active");

        document.getElementById("nc-cancel").addEventListener("click", closeModal);

        document.getElementById("new-case-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const title = document.getElementById("nc-title").value.trim();
            const description = document.getElementById("nc-description").value.trim();
            const priority = parseInt(document.getElementById("nc-priority").value, 10);

            if (!title) return;

            try {
                await Api.createCase({
                    title,
                    description,
                    prioritycode: priority,
                });
                Utils.showToast("Case created successfully", "success");
                closeModal();
                await loadCases();
            } catch (err) {
                Utils.showToast(`Failed to create case: ${err.message}`, "error");
            }
        });
    }

    /**
     * Close any open modal.
     */
    function closeModal() {
        const backdrop = document.getElementById("modal-backdrop");
        if (backdrop) backdrop.classList.remove("active");
    }

    /**
     * Return summary stats for the dashboard.
     */
    async function getStats() {
        try {
            const [active, resolved, escalated] = await Promise.all([
                Api.getCount("incidents", "statuscode eq 1"),
                Api.getCount("incidents", "statuscode eq 2"),
                Api.getCount("incidents", "prioritycode eq 1 and statuscode eq 1"),
            ]);
            return { active, resolved, escalated, total: active + resolved };
        } catch {
            return { active: 0, resolved: 0, escalated: 0, total: 0 };
        }
    }

    return {
        init,
        loadCases,
        getStats,
        closeModal,
    };
})();
