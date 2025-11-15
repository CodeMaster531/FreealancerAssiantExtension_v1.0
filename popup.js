let allProjects = [];
let darkMode = false;
// Helper: Send message to background
function sendMessageAsync(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
  });
}
// Load theme preference from local storage
chrome.storage.local.get("darkMode", (data) => {
  darkMode = !!data.darkMode;
  document.body.classList.toggle("dark", darkMode);
  document.getElementById("themeToggle").innerHTML = darkMode
    ? '<i class="fa-solid fa-sun"></i>'
    : '<i class="fa-solid fa-moon"></i>';
});
// reload source
chrome.action.setBadgeText({ text: "" });//remove badge num
chrome.runtime.sendMessage({action:'formatBadge'});//format badage num 0;
chrome.runtime.sendMessage({ action: "clearNewFlags" });// Listen for the popup opening and reset 'pro_stat' values

// Render projects in the popup
function renderProjects(projects) {
  const container = document.getElementById("projects");
  container.innerHTML = ""; // Clear existing projects

  if (!projects.length) {
    container.innerHTML = `<p style="text-align:center;color:#888;">No new projects found.</p>`;
    return;
  }

  projects.forEach((p) => {
    const div = document.createElement("div");
    div.className = "project";

    const snippet = p.preview_description
      ? p.preview_description.slice(0, 80) + "..."
      : "";
    const summary = p.ai_summary || "Fetching summary...";

    const flag = p.country?.code
      ? String.fromCodePoint(
          ...[...p.country.code.toUpperCase()].map(
            (c) => 127397 + c.charCodeAt()
          )
        )
      : "";

    div.innerHTML = `
      <div class="title">  ${p.pro_stat === 1 ? `<span class="new-badge">NEW</span>` : ""}<i class="fa-solid fa-briefcase"></i>${" "+p.title}</div>
      <div class="price">
        <span style="font-weight:bold;">${p.currency.sign} ${
      p.budget.minimum
    }-${p.budget.maximum} ${
      p.currency.code
    } [ ${p.type[0].toUpperCase()}${p.type.slice(1)} ]</span> 
        <span style="float:right;font-weight:bold;">bid: ${
          p.bid_stats.bid_count
        } avg: $${Math.floor(p.bid_stats.bid_avg)}</span>
      </div>
      <div class="snippet">${snippet}</div>
      <div class="summary"><i class="fa-solid fa-wand-magic-sparkles"></i> ${summary}</div>
      
      <div class="url-pill" role="group" aria-label="Shareable link">
      <div class="url-text" id="urlText" title="This is project url">
        <span class="path">${p.url}
      </div>

      <button class="copy-btn"  aria-label="Copy link" title="Copy link">
        <!-- simple clipboard SVG -->
        <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <rect x="9" y="2" width="8" height="4" rx="1.2" stroke="#38e66cff" stroke-width="1.2" fill="none"></rect>
          <rect x="6.5" y="6" width="10.5" height="13" rx="2" stroke="#38e66cff" stroke-width="1.2" fill="none"></rect>
        </svg>
        <span style="font-size:13px;color:#38e66cff">Copy</span>
      </button>
      <div class="tooltip" id=${p.id} role="status" aria-live="polite">Copied!</div>
    `;
    // Click copy -> copy the url of project
    div
      .querySelector(".copy-btn")
      .addEventListener("click", () => copyToClipboard(p.url,p.id));
    // Click title → open project + auto-fill bid
    div.querySelector(".title").addEventListener("click", () => {
      if (!p.url) return; // Ensure URL exists
      sendMessageAsync({ action: "openProject", url: p.url });
    });

    container.appendChild(div);
  });
}
// Load projects from local storage
chrome.storage.local.get("projects", (data) => {
  if (data.projects) {
    allProjects = data.projects.map((p) => ({
      ...p,
      ai_summary: `AI Summary: ${p.title.split(" ").slice(0, 5).join(" ")}...`,
    }));
    renderProjects(allProjects);
  }
});
// Search for projects based on the input
document.getElementById("search").addEventListener("input", (e) => {
  const keyword = e.target.value.toLowerCase();
  const filtered = allProjects.filter(
    (p) =>
      p.title.toLowerCase().includes(keyword) ||
      (p.preview_description || "").toLowerCase().includes(keyword)
  );
  renderProjects(filtered);
});
// Listen for messages from the background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log(msg);
  if (msg.action === "updatePopup") {
    chrome.storage.local.get("projects", (data) => {
      if (data.projects) {
        allProjects = data.projects.map((p) => ({
          ...p,
          ai_summary: `AI Summary: ${p.title
            .split(" ")
            .slice(0, 5)
            .join(" ")}...`,
          }));
          renderProjects(allProjects); // Re-render the projects with updated data
        }
        sendResponse({ status: true }); // Optional response back
      });
      return true;
    // Update the popup UI with the received data
  }
});
// Refresh projects
document.getElementById("refresh").addEventListener("click", async () => {
  document.getElementById("loadingSpinner").style.display = "block";

  // Hide the projects list while refreshing
  document.getElementById("projects").style.display = "none";

  await sendMessageAsync({ action: "refreshProjects" });
  chrome.storage.local.get("projects", (data) => {
    if (data.projects) {
      allProjects = data.projects.map((p) => ({
        ...p,
        ai_summary: `AI Summary: ${p.title
          .split(" ")
          .slice(0, 5)
          .join(" ")}...`,
      }));
      // renderProjects(allProjects); // Re-render the projects with updated data
      document.getElementById("loadingSpinner").style.display = "none";
      document.getElementById("projects").style.display = "block";
    }
  });
});
// Toggle theme
document.getElementById("themeToggle").addEventListener("click", () => {
  darkMode = !darkMode;
  document.body.classList.toggle("dark", darkMode);
  document.getElementById("themeToggle").innerHTML = darkMode
    ? '<i class="fa-solid fa-sun"></i>'
    : '<i class="fa-solid fa-moon"></i>';
  chrome.storage.local.set({ darkMode });
});
// Open the options page when the settings button is clicked
document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById("guideBtn").addEventListener("click", () => {
  window.open(chrome.runtime.getURL("guide.html"), "_blank");
});
document.addEventListener("DOMContentLoaded", function() {
  const zoomPageButton = document.getElementById("zommPage");
  if (zoomPageButton) {
    zoomPageButton.addEventListener("click", () => {
      window.open(chrome.runtime.getURL("zommPage.html"), "_blank");
    });
  }
  return;
});
//Link copy function

//Link Copy function
// const tooltip = document.getElementById("tooltip");
async function copyToClipboard(text,id) {
  const tooltip = document.getElementById("tooltip");
  try {
    await navigator.clipboard.writeText(text);
    showTooltip("Copied!",id);
  } catch (err) {
    fallbackCopyText(text);
    showTooltip("Copied!",id);
  }

  function fallbackCopyText(value) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function showTooltip(message,id) {
    const tooltip = document.getElementById(id);
    tooltip.textContent = message;
    tooltip.style.display = "inline";
    setTimeout(() => (tooltip.style.display = "none"), 1500);
  }
}
