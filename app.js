(() => {
  "use strict";

  const payload = window.GPU_DATA || { records: [], recordCount: 0 };
  const records = payload.records.map((record, index) => ({ ...record, __index: index }));
  const byId = new Map(records.map(record => [record.id, record]));
  const vendorOrder = { NVIDIA: 0, AMD: 1, Intel: 2 };
  const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  const defaults = { query: "", category: "全部", vendor: "全部", series: "GeForce RTX 50", sort: "tdp-desc" };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const els = {
    search: $("#searchInput"), clearSearch: $("#clearSearch"), categoryTabs: $("#categoryTabs"),
    vendorChips: $("#vendorChips"), series: $("#seriesSelect"), sort: $("#sortSelect"),
    results: $("#results"), resultSummary: $("#resultSummary"), empty: $("#emptyState"),
    reset: $("#resetFilters"), emptyReset: $("#emptyReset"), share: $("#shareButton"),
    compareTray: $("#compareTray"), compareCount: $("#compareCount"),
    compareChips: $("#compareChips"), clearCompare: $("#clearCompare"),
    openCompare: $("#openCompare"), navCompare: $("#navCompare"),
    navCompareCount: $("#navCompareCount"), detailDialog: $("#detailDialog"),
    detailContent: $("#detailContent"), compareDialog: $("#compareDialog"),
    compareTableWrap: $("#compareTableWrap"), toast: $("#toast"),
  };

  const params = new URLSearchParams(location.search);
  const state = {
    query: params.has("q") ? params.get("q") : defaults.query,
    category: params.has("category") ? params.get("category") : defaults.category,
    vendor: params.has("vendor") ? params.get("vendor") : defaults.vendor,
    series: params.has("series") ? params.get("series") : defaults.series,
    sort: params.has("sort") ? params.get("sort") : defaults.sort,
    compare: new Set(loadCompare()),
  };

  const specDefinitions = [
    ["vendor", "厂商"], ["category", "用途"], ["series", "系列"],
    ["architecture", "架构"], ["process", "制程"], ["launchDate", "上市日期"],
    ["chip", "GPU 芯片"], ["board", "板卡 / 系统代号"],
    ["tdpW", "功耗 / TDP"], ["dynamicBoost", "动态功耗增幅"],
    ["recommendedPsuW", "建议电源"], ["transistorsB", "晶体管"], ["dieSizeMm2", "芯片面积"],
    ["gpc", "GPC"], ["tpc", "TPC"], ["sm", "SM"], ["computeUnits", "计算单元"],
    ["xeCores", "Xe 核心"], ["executionUnits", "执行单元"], ["cudaCores", "CUDA 核心"],
    ["shaderCores", "着色器"], ["tensorCores", "Tensor 核心"], ["xmxEngines", "XMX 引擎"],
    ["rtCores", "RT / 光追单元"], ["aiAccelerators", "AI 加速器"], ["rops", "ROP"],
    ["baseClockMhz", "基础频率"], ["baseClock", "基础频率范围"],
    ["boostClockMhz", "加速频率"], ["boostClock", "加速频率范围"],
    ["memoryGb", "显存容量"], ["memoryType", "显存类型"], ["memoryConfig", "显存配置"],
    ["memoryBusBit", "显存位宽"], ["memoryBusSpeed", "位宽 / 速率"],
    ["memorySpeedGbps", "显存速率"], ["memoryBandwidthGBs", "显存带宽"],
    ["l1CacheKb", "L1 缓存"], ["l2CacheKb", "L2 缓存"], ["l2Cache", "L2 缓存"],
    ["infinityCacheMb", "Infinity Cache"], ["aiTops", "AI TOPS"],
    ["int4Tops", "INT4 TOPS"], ["int8Tops", "INT8 TOPS"],
    ["fp4TensorTops", "FP4 Tensor TOPS"], ["fp8Int8TensorTops", "FP8 / INT8 Tensor TOPS"],
    ["fp16TensorTflops", "FP16 Tensor TFLOPS"], ["fp16Tflops", "FP16 TFLOPS"],
    ["fp32Tflops", "FP32 TFLOPS"], ["perfRatio", "性能指数"],
    ["msrpUsd", "建议零售价（美元）"], ["msrpCny", "建议零售价（人民币）"], ["onSale", "源表在售状态"],
  ];

  const detailGroups = [
    ["产品信息", ["vendor", "category", "series", "architecture", "process", "launchDate", "chip", "board"]],
    ["核心与频率", ["gpc", "tpc", "sm", "computeUnits", "xeCores", "executionUnits", "cudaCores", "shaderCores", "tensorCores", "xmxEngines", "rtCores", "aiAccelerators", "rops", "baseClockMhz", "baseClock", "boostClockMhz", "boostClock"]],
    ["显存与缓存", ["memoryGb", "memoryType", "memoryConfig", "memoryBusBit", "memoryBusSpeed", "memorySpeedGbps", "memoryBandwidthGBs", "l1CacheKb", "l2CacheKb", "l2Cache", "infinityCacheMb"]],
    ["性能、功耗与价格", ["tdpW", "dynamicBoost", "recommendedPsuW", "transistorsB", "dieSizeMm2", "aiTops", "int4Tops", "int8Tops", "fp4TensorTops", "fp8Int8TensorTops", "fp16TensorTflops", "fp16Tflops", "fp32Tflops", "perfRatio", "msrpUsd", "msrpCny", "onSale"]],
  ];
  const specLabels = new Map(specDefinitions);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase("zh-CN").replace(/[\s_\-/]+/g, " ").trim();
  }

  function formatNumber(value, maximumFractionDigits = 2) {
    if (typeof value !== "number") return value;
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(value);
  }

  function unitValue(value, unit, digits = 2) {
    if (value === undefined || value === null || value === "") return "—";
    if (typeof value === "string" && /[a-zA-Z￥$]/.test(value)) return value;
    return `${formatNumber(value, digits)} ${unit}`;
  }

  function formatValue(key, value) {
    if (value === undefined || value === null || value === "") return "—";
    const units = {
      tdpW: "W", recommendedPsuW: "W", transistorsB: "B", dieSizeMm2: "mm²",
      baseClockMhz: "MHz", boostClockMhz: "MHz", memoryGb: "GB", memoryBusBit: "bit",
      memorySpeedGbps: "Gbps", memoryBandwidthGBs: "GB/s", l1CacheKb: "KB",
      l2CacheKb: "KB", infinityCacheMb: "MB", aiTops: "TOPS", int4Tops: "TOPS",
      int8Tops: "TOPS", fp4TensorTops: "TOPS", fp8Int8TensorTops: "TOPS",
      fp16TensorTflops: "TFLOPS", fp16Tflops: "TFLOPS", fp32Tflops: "TFLOPS",
    };
    if (key === "launchDate") {
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value;
    }
    if (key === "msrpUsd") return typeof value === "number" ? `$${formatNumber(value, 0)}` : value;
    if (key === "msrpCny") return typeof value === "number" ? `¥${formatNumber(value, 0)}` : value;
    if (key === "perfRatio") return `${formatNumber(value, 3)}×`;
    if (key === "onSale") return String(value).toUpperCase() === "Y" ? "是" : String(value).toUpperCase() === "N" ? "否" : value;
    if (units[key]) return unitValue(value, units[key]);
    return formatNumber(value);
  }

  function coreMetric(record) {
    if (record.cudaCores !== undefined) return ["CUDA 核心", formatValue("cudaCores", record.cudaCores)];
    if (record.shaderCores !== undefined) return ["着色器", formatValue("shaderCores", record.shaderCores)];
    if (record.xeCores !== undefined) return ["Xe 核心", formatValue("xeCores", record.xeCores)];
    return ["架构", record.architecture || "—"];
  }

  function statusMarkup(record) {
    if (record.status === "verified") return '<span class="status-label verified">官网核对</span>';
    if (record.status === "uncertain") return '<span class="status-label">源表：不确定</span>';
    if (record.status === "eol") return '<span class="status-label eol">源表：EOL</span>';
    return "";
  }

  function renderCard(record) {
    const [coreLabel, coreValue] = coreMetric(record);
    const selected = state.compare.has(record.id);
    return `
      <article class="gpu-card${selected ? " selected" : ""}" data-id="${escapeHtml(record.id)}">
        <div class="card-top"><span class="vendor-label">${escapeHtml(record.vendor)} · ${escapeHtml(record.category)}</span>${statusMarkup(record)}</div>
        <h3>${escapeHtml(record.name)}</h3>
        <p class="series-line">${escapeHtml(record.series)} · ${escapeHtml(record.architecture || "架构未注明")}</p>
        <div class="card-metrics">
          <div><span>显存</span><strong>${escapeHtml(formatValue("memoryGb", record.memoryGb))}</strong></div>
          <div><span>${escapeHtml(coreLabel)}</span><strong>${escapeHtml(coreValue)}</strong></div>
          <div><span>功耗</span><strong>${escapeHtml(formatValue("tdpW", record.tdpW))}</strong></div>
          <div><span>显存带宽</span><strong>${escapeHtml(formatValue("memoryBandwidthGBs", record.memoryBandwidthGBs))}</strong></div>
        </div>
        <div class="card-footer">
          <button class="details-button" type="button" data-action="details">查看完整规格</button>
          <label class="compare-toggle">
            <input type="checkbox" data-action="compare" ${selected ? "checked" : ""} aria-label="将 ${escapeHtml(record.name)} 加入对比">
            <i aria-hidden="true"></i><span>加入对比</span>
          </label>
        </div>
      </article>`;
  }

  function searchable(record) {
    return normalize(Object.entries(record)
      .filter(([key]) => !["sourceSheet", "sourceIssues", "__index"].includes(key))
      .map(([, value]) => value)
      .join(" "));
  }
  records.forEach(record => { record.__search = searchable(record); });

  function availableSeries() {
    return [...new Set(records
      .filter(record => state.category === "全部" || record.category === state.category)
      .filter(record => state.vendor === "全部" || record.vendor === state.vendor)
      .map(record => record.series))].sort(collator.compare);
  }

  function renderSeriesOptions() {
    const options = availableSeries();
    if (state.series !== "全部" && !options.includes(state.series)) state.series = "全部";
    els.series.innerHTML = '<option value="全部">全部系列</option>' + options
      .map(series => `<option value="${escapeHtml(series)}">${escapeHtml(series)}</option>`).join("");
    els.series.value = state.series;
  }

  function filteredRecords() {
    const terms = normalize(state.query).split(" ").filter(Boolean);
    const filtered = records.filter(record => {
      if (state.category !== "全部" && record.category !== state.category) return false;
      if (state.vendor !== "全部" && record.vendor !== state.vendor) return false;
      if (state.series !== "全部" && record.series !== state.series) return false;
      return terms.every(term => record.__search.includes(term));
    });
    const numeric = key => record => {
      if (typeof record[key] === "number") return record[key];
      const numbers = String(record[key] ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
      return numbers.length ? Math.max(...numbers) : -Infinity;
    };
    if (state.sort === "launch-desc") filtered.sort((a, b) => String(b.launchDate || "").localeCompare(String(a.launchDate || "")) || collator.compare(a.name, b.name));
    else if (state.sort === "memory-desc") filtered.sort((a, b) => numeric("memoryGb")(b) - numeric("memoryGb")(a) || collator.compare(a.name, b.name));
    else if (state.sort === "tdp-desc") filtered.sort((a, b) => numeric("tdpW")(b) - numeric("tdpW")(a) || collator.compare(a.name, b.name));
    else if (state.sort === "bandwidth-desc") filtered.sort((a, b) => numeric("memoryBandwidthGBs")(b) - numeric("memoryBandwidthGBs")(a) || collator.compare(a.name, b.name));
    else filtered.sort((a, b) => a.__index - b.__index);
    return filtered;
  }

  function syncControls() {
    els.search.value = state.query;
    els.search.closest(".hero-search").classList.toggle("has-value", Boolean(state.query));
    $$('[data-category]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.category === state.category)));
    $$('[data-vendor]').forEach(button => button.classList.toggle("active", button.dataset.vendor === state.vendor));
    els.sort.value = state.sort;
  }

  function updateUrl() {
    const next = new URLSearchParams();
    if (state.query !== defaults.query) next.set("q", state.query);
    if (state.category !== defaults.category) next.set("category", state.category);
    if (state.vendor !== defaults.vendor) next.set("vendor", state.vendor);
    if (state.series !== defaults.series) next.set("series", state.series);
    if (state.sort !== defaults.sort) next.set("sort", state.sort);
    const query = next.toString();
    try { history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`); } catch (_) {}
  }

  function renderResults() {
    const matches = filteredRecords();
    els.results.innerHTML = matches.map(renderCard).join("");
    els.results.hidden = matches.length === 0;
    els.empty.hidden = matches.length !== 0;
    const context = [state.vendor, state.category, state.series].filter(value => value !== "全部").join(" · ");
    els.resultSummary.innerHTML = `找到 <strong>${matches.length}</strong> 颗 GPU${context ? ` · ${escapeHtml(context)}` : ""}`;
  }

  function renderAll({ updateSeries = true } = {}) {
    if (updateSeries) renderSeriesOptions();
    syncControls();
    renderResults();
    renderCompareTray();
    updateUrl();
  }

  function resetFilters() {
    Object.assign(state, defaults);
    renderAll();
    els.search.focus();
  }

  function loadCompare() {
    try {
      const ids = JSON.parse(localStorage.getItem("gpuCompare") || "[]");
      return Array.isArray(ids) ? ids.filter(id => byId.has(id)).slice(0, 4) : [];
    } catch (_) { return []; }
  }

  function saveCompare() {
    try { localStorage.setItem("gpuCompare", JSON.stringify([...state.compare])); } catch (_) {}
  }

  function toggleCompare(id, checked) {
    if (checked && state.compare.size >= 4 && !state.compare.has(id)) {
      showToast("最多同时对比 4 颗 GPU");
      renderResults();
      return;
    }
    if (checked) state.compare.add(id); else state.compare.delete(id);
    saveCompare();
    renderResults();
    renderCompareTray();
  }

  function renderCompareTray() {
    const selected = [...state.compare].map(id => byId.get(id)).filter(Boolean);
    els.compareTray.hidden = selected.length === 0;
    els.compareCount.textContent = selected.length;
    els.navCompareCount.textContent = selected.length;
    els.compareChips.innerHTML = selected.map(record => `
      <div class="compare-chip"><span>${escapeHtml(record.name)}</span><button type="button" data-remove="${escapeHtml(record.id)}" aria-label="移除 ${escapeHtml(record.name)}">×</button></div>`).join("");
    els.openCompare.disabled = selected.length === 0;
  }

  function summaryItems(record) {
    return [
      ["显存", formatValue("memoryGb", record.memoryGb)],
      [coreMetric(record)[0], coreMetric(record)[1]],
      ["功耗", formatValue("tdpW", record.tdpW)],
      ["带宽", formatValue("memoryBandwidthGBs", record.memoryBandwidthGBs)],
    ];
  }

  function openDetails(record) {
    const groups = detailGroups.map(([title, keys]) => {
      const items = keys.filter(key => record[key] !== undefined && record[key] !== null && record[key] !== "");
      if (!items.length) return "";
      return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="spec-grid">${items.map(key => `
        <div class="spec-item"><span>${escapeHtml(specLabels.get(key) || key)}</span><strong>${escapeHtml(formatValue(key, record[key]))}</strong></div>`).join("")}</div></section>`;
    }).join("");
    const warning = record.status === "uncertain"
      ? '<div class="source-warning"><strong>源表标记为不确定。</strong> 该条目可能是预测、待确认或规格尚未补全，请结合最新正式资料使用。</div>'
      : record.status === "eol" ? '<div class="source-warning"><strong>源表标记为 EOL。</strong> 该产品可能已进入生命周期末期。</div>' : "";
    const issues = record.sourceIssues?.length
      ? `<div class="source-warning"><strong>源表异常记录。</strong> ${escapeHtml(record.sourceIssues.join("；"))}</div>` : "";
    const verification = record.verificationNote
      ? `<div class="verification-note"><strong>校对说明。</strong> ${escapeHtml(record.verificationNote)}</div>` : "";
    const sourceLink = record.sourceUrl
      ? ` · <a href="${escapeHtml(record.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(record.sourceLabel || "官方规格来源")}</a>` : "";
    els.detailContent.innerHTML = `
      <div class="detail-hero">
        <span class="vendor-label">${escapeHtml(record.vendor)} · ${escapeHtml(record.category)}</span>
        <h2 id="detailTitle">${escapeHtml(record.name)}</h2>
        <p>${escapeHtml(record.series)} · ${escapeHtml(record.architecture || "架构未注明")}</p>
      </div>
      <div class="detail-body">
        <div class="detail-summary">${summaryItems(record).map(([label, val]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(val)}</strong></div>`).join("")}</div>
        ${groups}${warning}${verification}${issues}
        <p class="source-locator">Excel 参考位置：${escapeHtml(record.sourceSheet)} · 第 ${escapeHtml(record.sourceRow)} 行${sourceLink}</p>
      </div>`;
    showDialog(els.detailDialog);
  }

  function openComparison() {
    const selected = [...state.compare].map(id => byId.get(id)).filter(Boolean);
    if (!selected.length) { showToast("请先选择要对比的 GPU"); return; }
    const rows = specDefinitions.filter(([key]) => selected.some(record => record[key] !== undefined && record[key] !== null && record[key] !== ""));
    els.compareTableWrap.innerHTML = `<table class="compare-table">
      <thead><tr><th>规格项目</th>${selected.map(record => `<th><span class="vendor-label">${escapeHtml(record.vendor)}</span><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.series)}</small></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([key, label]) => `<tr><th>${escapeHtml(label)}</th>${selected.map(record => `<td>${escapeHtml(formatValue(key, record[key]))}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
    showDialog(els.compareDialog);
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  async function copyShareLink() {
    updateUrl();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("筛选链接已复制");
    } catch (_) {
      const input = document.createElement("input");
      input.value = url; document.body.appendChild(input); input.select();
      document.execCommand("copy"); input.remove(); showToast("筛选链接已复制");
    }
  }

  let searchTimer;
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    els.search.closest(".hero-search").classList.toggle("has-value", Boolean(state.query));
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderAll({ updateSeries: false }), 90);
  });
  els.clearSearch.addEventListener("click", () => { state.query = ""; renderAll({ updateSeries: false }); els.search.focus(); });
  els.categoryTabs.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category; renderAll();
  });
  els.vendorChips.addEventListener("click", event => {
    const button = event.target.closest("[data-vendor]");
    if (!button) return;
    state.vendor = button.dataset.vendor; renderAll();
  });
  els.series.addEventListener("change", () => { state.series = els.series.value; renderAll({ updateSeries: false }); });
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; renderAll({ updateSeries: false }); });
  els.reset.addEventListener("click", resetFilters);
  els.emptyReset.addEventListener("click", resetFilters);
  els.share.addEventListener("click", copyShareLink);
  els.results.addEventListener("click", event => {
    const card = event.target.closest(".gpu-card");
    if (!card) return;
    const record = byId.get(card.dataset.id);
    if (!record) return;
    if (event.target.closest('[data-action="details"]')) openDetails(record);
  });
  els.results.addEventListener("change", event => {
    if (event.target.matches('[data-action="compare"]')) {
      const card = event.target.closest(".gpu-card");
      toggleCompare(card.dataset.id, event.target.checked);
    }
  });
  els.compareChips.addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (button) toggleCompare(button.dataset.remove, false);
  });
  els.clearCompare.addEventListener("click", () => { state.compare.clear(); saveCompare(); renderResults(); renderCompareTray(); });
  els.openCompare.addEventListener("click", openComparison);
  els.navCompare.addEventListener("click", openComparison);
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => closeDialog(document.getElementById(button.dataset.closeDialog))));
  [els.detailDialog, els.compareDialog].forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }));
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      event.preventDefault(); els.search.focus();
    }
  });

  $("#totalCount").textContent = payload.recordCount || records.length;
  $("#seriesCount").textContent = new Set(records.map(record => record.series)).size;
  $("#vendorCount").textContent = new Set(records.map(record => record.vendor)).size;
  $("#sourceFile").textContent = payload.generatedFrom ? `DATA · ${payload.generatedFrom}` : "";
  renderAll();
})();
