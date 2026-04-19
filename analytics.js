(function () {
  const analyticsStorageKey = "Antarmana-analytics-events";
  const sessionStorageKey = "Antarmana-analytics-session";
  const maxEvents = 250;

  function getSessionId() {
    try {
      const existingSessionId = window.sessionStorage.getItem(sessionStorageKey);
      if (existingSessionId) {
        return existingSessionId;
      }

      const nextSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem(sessionStorageKey, nextSessionId);
      return nextSessionId;
    } catch {
      return `session-${Date.now()}`;
    }
  }

  function getEvents() {
    try {
      const savedEvents = window.localStorage.getItem(analyticsStorageKey);
      return savedEvents ? JSON.parse(savedEvents) : [];
    } catch {
      return [];
    }
  }

  function setEvents(events) {
    try {
      const trimmedEvents = events.slice(-maxEvents);
      window.localStorage.setItem(analyticsStorageKey, JSON.stringify(trimmedEvents));
    } catch {
      // Ignore analytics storage failures so storefront behavior stays unaffected.
    }
  }

  function createPayload(eventName, details) {
    return {
      event: eventName,
      details: details || {},
      page: window.location.pathname.split("/").pop() || "index.html",
      title: document.title,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId()
    };
  }

  function trackEvent(eventName, details) {
    if (!eventName) {
      return;
    }

    const events = getEvents();
    events.push(createPayload(eventName, details));
    setEvents(events);
  }

  function trackPageView() {
    trackEvent("page_view", {
      referrer: document.referrer || "direct"
    });
  }

  function clearEvents() {
    try {
      window.localStorage.removeItem(analyticsStorageKey);
    } catch {
      // Ignore storage errors for this helper.
    }
  }

  function getSummary() {
    const events = getEvents();
    const totals = events.reduce((summary, entry) => {
      summary[entry.event] = (summary[entry.event] || 0) + 1;
      return summary;
    }, {});

    return {
      totalEvents: events.length,
      byEvent: totals,
      events
    };
  }

  function handleTrackedLinkClick(event) {
    const link = event.target.closest("a");
    if (!link) {
      return;
    }

    trackEvent("link_click", {
      href: link.getAttribute("href") || "",
      label: (link.textContent || "").trim()
    });
  }

  window.siteAnalytics = {
    clearEvents,
    getEvents,
    getSummary,
    trackEvent,
    trackPageView
  };

  document.addEventListener("click", handleTrackedLinkClick);
  trackPageView();
})();
