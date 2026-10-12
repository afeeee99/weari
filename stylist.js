// =====================================================
// Weari stylist — powered by Gemini API
// =====================================================

function getOnboardingPreferences() {
  try {
    const raw = localStorage.getItem("weari_onboarding_answers");
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      goal: data.goal || null,
      styles: Array.isArray(data.styles) ? data.styles : [],
      occasions: Array.isArray(data.occasions) ? data.occasions : [],
    };
  } catch {
    return null;
  }
}

async function suggestOutfit(items, occasion, previousIds = [], mustIncludeItemId = null) {
  if (!items || items.length === 0) {
    return { missing: "Your wardrobe is empty. Add pieces first to get an outfit suggestion." };
  }

  // Send only necessary wardrobe attributes to keep request light & fast
  const wardrobeItems = items.map((it) => ({
    id: it.id,
    category: it.category,
    color: it.color,
    occasions: it.occasions,
  }));

  const userPreferences = getOnboardingPreferences();

  const res = await fetch("/api/style", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      occasion,
      items: wardrobeItems,
      previousOutfitIds: previousIds,
      mustIncludeItemId,
      userPreferences,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Our stylist is busy, tap Try again");
  }

  const data = await res.json();

  if (!data.canFormOutfit) {
    return {
      missing: data.missing || `Add more items tagged '${occasion}' to get a suggestion.`,
    };
  }

  // Map returned itemIds back to wardrobe items
  const itemMap = new Map(items.map((it) => [it.id, it]));
  const outfit = [];

  if (Array.isArray(data.outfit)) {
    for (const piece of data.outfit) {
      const item = itemMap.get(piece.itemId);
      if (item) {
        outfit.push({
          role: piece.role || item.category,
          item,
        });
      }
    }
  }

  if (outfit.length === 0) {
    return {
      missing: data.missing || `Could not assemble a complete look. Try adding more pieces tagged '${occasion}'.`,
    };
  }

  return {
    outfit,
    explanation: data.explanation || "",
    repeated: false,
  };
}
