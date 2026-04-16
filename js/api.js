/* ===================================================
   api.js — D365 CE Dataverse Web API wrapper
   Depends on: auth.js
   =================================================== */

const Api = (() => {
    "use strict";

    const API_VERSION = "v9.2";

    /**
     * Build the full Web API URL for an entity set.
     */
    function buildUrl(entitySet, queryParams) {
        const base = `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}`;
        return queryParams ? base + Utils.buildQueryString(queryParams) : base;
    }

    /**
     * Core fetch wrapper with auth token injection.
     */
    async function request(url, options = {}) {
        const token = await Auth.getToken();
        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Content-Type": "application/json; charset=utf-8",
            Prefer: 'odata.include-annotations="*"',
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            const message =
                errorBody?.error?.message || `API error ${response.status}`;
            throw new Error(message);
        }

        if (response.status === 204) return null;
        return response.json();
    }

    /**
     * GET a collection of records.
     */
    async function getRecords(entitySet, odataQuery = "") {
        const url =
            `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}` +
            (odataQuery ? `?${odataQuery}` : "");
        const data = await request(url);
        return data?.value ?? [];
    }

    /**
     * GET a single record by id.
     */
    async function getRecord(entitySet, id, select) {
        let url = `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}(${id})`;
        if (select) url += `?$select=${select}`;
        return request(url);
    }

    /**
     * POST — create a new record.
     * @returns {string|null} the created record id (from OData-EntityId header)
     */
    async function createRecord(entitySet, data) {
        const url = `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}`;
        const token = await Auth.getToken();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json; charset=utf-8",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => null);
            throw new Error(err?.error?.message || `Create failed (${response.status})`);
        }

        const entityId = response.headers.get("OData-EntityId");
        if (entityId) {
            const match = entityId.match(/\(([^)]+)\)/);
            return match ? match[1] : null;
        }
        return null;
    }

    /**
     * PATCH — update an existing record.
     */
    async function updateRecord(entitySet, id, data) {
        const url = `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}(${id})`;
        return request(url, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    }

    /**
     * DELETE a record.
     */
    async function deleteRecord(entitySet, id) {
        const url = `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}(${id})`;
        return request(url, { method: "DELETE" });
    }

    /**
     * Run a FetchXML query.
     */
    async function fetchXml(entitySet, xml) {
        const encoded = encodeURIComponent(xml);
        const url = `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}?fetchXml=${encoded}`;
        const data = await request(url);
        return data?.value ?? [];
    }

    /**
     * Get count of records matching an optional filter.
     */
    async function getCount(entitySet, filter) {
        let url = `${Auth.getD365BaseUrl()}/api/data/${API_VERSION}/${entitySet}/$count`;
        if (filter) url += `?$filter=${filter}`;
        const token = await Auth.getToken();
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Count failed (${response.status})`);
        const text = await response.text();
        return parseInt(text, 10);
    }

    // ---- Domain-specific helpers ----

    /** Fetch incidents (support cases) */
    function getCases(odataQuery) {
        return getRecords("incidents", odataQuery);
    }

    /** Fetch a single case */
    function getCase(id) {
        return getRecord("incidents", id);
    }

    /** Create a new case */
    function createCase(data) {
        return createRecord("incidents", data);
    }

    /** Update a case */
    function updateCase(id, data) {
        return updateRecord("incidents", id, data);
    }

    /** Fetch timesheet entries (custom entity) */
    function getTimesheets(odataQuery) {
        return getRecords("inf_timesheetentries", odataQuery);
    }

    /** Create a timesheet entry */
    function createTimesheet(data) {
        return createRecord("inf_timesheetentries", data);
    }

    /** Update a timesheet entry */
    function updateTimesheet(id, data) {
        return updateRecord("inf_timesheetentries", id, data);
    }

    /** Delete a timesheet entry */
    function deleteTimesheet(id) {
        return deleteRecord("inf_timesheetentries", id);
    }

    return {
        getRecords,
        getRecord,
        createRecord,
        updateRecord,
        deleteRecord,
        fetchXml,
        getCount,
        getCases,
        getCase,
        createCase,
        updateCase,
        getTimesheets,
        createTimesheet,
        updateTimesheet,
        deleteTimesheet,
    };
})();
