// background.js - full (with per-project `pro_stat` added)
// pro_stat: 1 = new project (since last check), 0 = old project

let lastProjectIds = [];
let preferences = {
  interval: 30,
  apiKey: "", // default empty, load from storage
  autoFill: false,
  notifications: false,
  notifications_show_mode: false,
  bidTemplate: "",
  gptModel: "gpt-3.5-turbo",
  BidCondition: `Please write a winning bid that is attentive, flawless, courteous, engaging, and technical.
Provide a winning bid that would make the client eager to hire me, ensuring all aspects are covered.\n\n`,
};

let profile = {
  name: "",
  title: "",
  summary: "",
};

let TempBid = `Hello, I hope you're doing well.\n
I believe I am the best candidate for this project because I bring combination of proven experience, technical expertise, and strong attention to detail.\n
I have successfully completed similar projects in the past, which means I understand the challenges and how to solve them efficiently.\n
My focus is always delivering high-quality result, meeting deadlines, and ensuring smooth communication throughout the project.\n
I am committed to not only meeting your requirements but also adding value by suggesting improvements when possible.\n
Looking forward to working with you for the long term.\n
Best regards,\n
[Your Name]`;

const notificationMap = {};
let badge = 0;

// ---------------------------
// Load preferences and projects
// ---------------------------
async function loadPreferences() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["preferences", "profile", "projects"], (data) => {
      if (data.preferences) {
        preferences.interval = Math.max(
          30,
          data.preferences.interval ?? preferences.interval
        );
        preferences.autoFill =
          data.preferences.autoFill ?? preferences.autoFill;
        preferences.apiKey = data.preferences.apiKey || preferences.apiKey;
        preferences.notifications =
          data.preferences.notifications ?? preferences.notifications;
        preferences.notifications_show_mode =
          data.preferences.notifications_show_mode ??
          preferences.notifications_show_mode;
        preferences.bidTemplate = data.preferences.bidTemplate ?? TempBid;
        preferences.BidCondition =
          data.preferences.BidCondition ?? preferences.BidCondition;
        preferences.gptModel =
          data.preferences.gptModel ?? preferences.gptModel;
      }
      if (data.profile) {
        profile.name = data.profile.name ?? profile.name;
        profile.title = data.profile.title ?? profile.title;
        profile.summary = data.profile.summary ?? profile.summary;
      }

      // If stored projects exist, restore lastProjectIds so we can detect new ones next run
      if (data.projects && Array.isArray(data.projects)) {
        lastProjectIds = data.projects.map((p) => p.id);
      }

      console.log("preferences:", preferences);
      console.log("profile:", profile);
      console.log("restored lastProjectIds:", lastProjectIds);
      resolve();
    });
  });
}

// ---------------------------
// Setup periodic fetch (setInterval)
// ---------------------------
function setupAlarm() {
  setInterval(() => {
    console.log("Checking projects (interval seconds):", preferences.interval);
    fetchProjects();
  }, preferences.interval * 1000);
}

//-------------------------------
// Messaging helper (background -> popup)
// safe: checks chrome.runtime.lastError to avoid "Receiving end does not exist."
//--------------------------------
function sendMessageToPopup(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      // If there's a runtime.lastError, there's no receiver (popup closed)
      if (chrome.runtime.lastError) {
        // popup not open / not listening
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // Normal response handling
      if (!response) {
        reject(new Error("No response from popup"));
        return;
      }

      if (response.status === true) {
        resolve(response);
        return;
      }

      reject(new Error("Popup returned failure"));
    });
  });
}

// ---------------------------
// Fetch projects from Freelancer
// ---------------------------
async function fetchProjects() {
  try {
    const res = await fetch(
      "https://www.freelancer.com/api/projects/0.1/projects/active/?limit=30"
    );
    const data = await res.json();
    const projects = data.result?.projects || [];

    // Step 1: basic map to normalized projects (without pro_stat yet)
    const projectsWithUrl = projects
      .filter((p) => p.currency?.code !== "INR")
      .map((p) => ({
        id: p.id,
        type: p.type,
        currency: p.currency,
        title: p.title,
        budget: p.budget,
        country: p.country,
        bid_stats: p.bid_stats,
        preview_description: p.preview_description || p.description,
        url: `https://www.freelancer.com/projects/${p.seo_url || p.id}`,
      }));

    // Step 2: Determine which IDs are new compared to lastProjectIds
    const newProjectIds = projectsWithUrl
      .filter((p) => !lastProjectIds.includes(p.id))
      .map((p) => p.id);

    // Step 3: Process the projects and update pro_stat
    const processedProjects = projectsWithUrl.map((p) => ({
      ...p,
      pro_stat: lastProjectIds.includes(p.id) ? 0 : 1, // 0 for old projects, 1 for new
    }));

    // Step 4: Update lastProjectIds with all project IDs
    lastProjectIds = processedProjects.map((p) => p.id);

    // Save processed projects to storage
    chrome.storage.local.set({ projects: processedProjects });

    // Step 5: Send notification or update badge for new projects
    const newOnes = processedProjects.filter((p) => p.pro_stat === 1);
    if (newOnes.length > 0) {
      badge += newOnes.length;
      chrome.action.setBadgeText({ text: String(badge) });
      chrome.action.setBadgeBackgroundColor({ color: "#4d68ffff" });

      // Send message to popup
      sendMessageToPopup({ action: "updatePopup" }).catch((err) => {
        console.warn("Could not message popup:", err);
      });

      // Notify desktop if notifications are enabled
      if (preferences.notifications) {
        newOnes.forEach((p, i) => {
          const notifId = String(p.id);
          notificationMap[notifId] = p.url;
          setTimeout(() => {
            chrome.notifications.create(notifId, {
              type: "basic",
              iconUrl: "message_icon.png",
              title: p.title,
              message: `Budget: ${p.currency?.sign || "$"}${
                p.budget?.minimum ?? ""
              }-${p.budget?.maximum ?? ""} ${p.currency?.code || ""} [ ${
                p.type ? p.type[0].toUpperCase() + p.type.slice(1) : ""
              } ]\nClick to view`,
              priority: 2,
              requireInteraction: preferences.notifications_show_mode,
            });
          }, i * 459);
        });
      }
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

// ---------------------------
// Notification click handler
// ---------------------------
chrome.notifications.onClicked.addListener((notifId) => {
  const url = notificationMap[notifId];
  if (url) {
    chrome.tabs.create({ url });
    chrome.notifications.clear(notifId);
  }
});

// ---------------------------
// Alarm listener
// ---------------------------
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "checkProjects") fetchProjects();
});

// ---------------------------
// Generate AI bid
// ---------------------------
async function generateAIBid(description) {
  if (!preferences.apiKey) {
    console.warn("apikey is missing");
    return preferences.bidTemplate ? preferences.bidTemplate : TempBid;
  }
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${preferences.apiKey}`,
      },
      body: JSON.stringify({
        model: `${preferences.gptModel}`,
        messages: [
          {
            role: "system",
            content:
              "You are a professional freelancer. Write a polite, concise, convincing bid for a client. End each sentence with a line break.",
          },
          {
            role: "user",
            content:
              `This is project description.(main):\n\n ${description}\n\n` +
              (profile.name
                ? `Also, reference this:This is my name:${profile.name}\n\n`
                : "") +
              (profile.title
                ? `This is my title/role : \n\n ${profile.title}\n\n`
                : "") +
              (profile.summary
                ? `This is my summary(not essential):\n\n ${profile.summary}`
                : "") +
              `${preferences.BidCondition}\n\nCharacters must be no longer than 1500.`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    const data = await resp.json();
    console.log("AI response:", data);
    return (
      data?.choices?.[0]?.message?.content ||
      (preferences.bidTemplate ? preferences.bidTemplate : TempBid)
    );
  } catch (err) {
    console.error("AI generation error:", err);
    return preferences.bidTemplate ? preferences.bidTemplate : TempBid;
  }
}

// ---------------------------
// Message listener
// ---------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.action === "refreshProjects") {
      await fetchProjects();
      sendResponse({ success: true });
    }

    if (msg.action === "formatBadge") {
      badge = 0;
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ success: true });
    }

    if (msg.action === "generateBid") {
      const bid = await generateAIBid(msg.description);
      sendResponse({ bid });
    }

    if (msg.action === "reloadExtension") {
      chrome.runtime.reload();
    }

    if (msg.action === "clearNewFlags") {
      chrome.storage.local.get("projects", (data) => {
        if (!data.projects) return;

        // Update the projects to set 'pro_stat' to 0 for all
        const updatedProjects = data.projects.map((p) => ({
          ...p,
          pro_stat: 0, // reset 'pro_stat' to 0
        }));

        // Save updated projects to storage
        chrome.storage.local.set({ projects: updatedProjects });

        // Respond to the popup that the operation was successful
        sendResponse({ success: true });
      });
    }
    if (msg.action === "openProject") {
      const { url } = msg;
      chrome.tabs.create({ url }, (tab) => {
        const listener = async (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
      });

      sendResponse({ success: true });
    }
  })();

  return true; // keep the message channel open
});

// ---------------------------
// Initialize extension
// ---------------------------
(async () => {
  await loadPreferences();
  setupAlarm();
  fetchProjects();
})();
