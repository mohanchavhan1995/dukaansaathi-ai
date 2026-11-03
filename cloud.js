
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://fdvwpvprsvozvliqotmt.supabase.co";
const SUPABASE_KEY = "sb_publishable_Zg_NMelV2LvGDCAqM4rbvw_CmNpCK-u";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const keys = {
  ledger: "dsa_ledger",
  stock: "dsa_stock",
  entries: "dsa_entries"
};

const backupTitle = "dashboard_data";

function getLocalData() {
  return {
    ledger: JSON.parse(localStorage.getItem(keys.ledger) || "[]"),
    stock: JSON.parse(localStorage.getItem(keys.stock) || "[]"),
    entries: JSON.parse(localStorage.getItem(keys.entries) || "[]")
  };
}

function setLocalData(data) {
  localStorage.setItem(keys.ledger, JSON.stringify(data.ledger || []));
  localStorage.setItem(keys.stock, JSON.stringify(data.stock || []));
  localStorage.setItem(keys.entries, JSON.stringify(data.entries || []));
}

async function saveCloudData(userId, rowId) {
  const payload = {
    user_id: userId,
    record_type: "app_backup",
    title: backupTitle,
    notes: JSON.stringify(getLocalData())
  };

  let result;

  if (rowId) {
    result = await supabase
      .from("shop_records")
      .update(payload)
      .eq("id", rowId);
  } else {
    result = await supabase
      .from("shop_records")
      .insert(payload)
      .select("id")
      .single();

    if (!result.error) {
      rowId = result.data.id;
    }
  }

  if (result.error) {
    console.error("Cloud save failed:", result.error.message);
  } else {
    console.log("Cloud backup saved.");
  }

  return rowId;
}

async function startCloudSync() {
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;

    if (error || !session) {
      window.location.replace("./login.html");
      return;
    }

    const user = session.user;

    const { data: row, error: readError } = await supabase
      .from("shop_records")
      .select("id, notes")
      .eq("user_id", user.id)
      .eq("record_type", "app_backup")
      .eq("title", backupTitle)
      .maybeSingle();

    if (readError) {
      console.error("Cloud read failed:", readError.message);
      return;
    }

    let rowId = row?.id || null;

    if (row && row.notes) {
      try {
        const cloudData = JSON.parse(row.notes);
        const localData = getLocalData();

        const localIsEmpty =
          localData.ledger.length === 0 &&
          localData.stock.length === 0 &&
          localData.entries.length === 0;

        const cloudIsEmpty =
          (!cloudData.ledger || cloudData.ledger.length === 0) &&
          (!cloudData.stock || cloudData.stock.length === 0) &&
          (!cloudData.entries || cloudData.entries.length === 0);

        if (localIsEmpty && !cloudIsEmpty) {
          setLocalData(cloudData);
          window.location.reload();
          return;
        }

        if (!localIsEmpty && cloudIsEmpty) {
          rowId = await saveCloudData(user.id, rowId);
        } else if (
          JSON.stringify(localData) !==
          JSON.stringify({
            ledger: cloudData.ledger || [],
            stock: cloudData.stock || [],
            entries: cloudData.entries || []
          })
        ) {
          setLocalData(cloudData);
          window.location.reload();
          return;
        }
      } catch (err) {
        console.error("Cloud data error:", err);
        return;
      }
    } else {
      rowId = await saveCloudData(user.id, rowId);
    }

    let saveTimer;
    const originalSetItem = localStorage.setItem.bind(localStorage);

    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);

      if (Object.values(keys).includes(key)) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          rowId = await saveCloudData(user.id, rowId);
        }, 1000);
      }
    };

    window.dsaLogout = async function () {
      const { error } = await supabase.auth.signOut();

      if (error) {
        alert("Logout failed. Please try again.");
        return;
      }

      window.location.replace("./login.html");
    };

    const logoutButton = document.createElement("button");
    logoutButton.textContent = "Logout";
    logoutButton.style.cssText =
      "position:fixed;top:15px;right:15px;z-index:99999;padding:10px 18px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:bold;";
    logoutButton.onclick = window.dsaLogout;
    document.body.appendChild(logoutButton);

    console.log("DukaanSaathi AI Cloud Sync connected.");
  } catch (err) {
    console.error("Cloud sync error:", err);
  }
}

startCloudSync();
