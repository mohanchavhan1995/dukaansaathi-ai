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

async function startCloudSync() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    console.log("Cloud sync: Login required.");
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

  if (row && row.notes) {
    let cloudData;

    try {
      cloudData = JSON.parse(row.notes);
    } catch {
      console.error("Cloud backup data is not valid JSON.");
      return;
    }

    const oldData = JSON.stringify(getLocalData());
    const newData = JSON.stringify({
      ledger: cloudData.ledger || [],
      stock: cloudData.stock || [],
      entries: cloudData.entries || []
    });

    if (oldData !== newData) {
      setLocalData(cloudData);
      sessionStorage.setItem("dsa_cloud_loaded", "yes");
      location.reload();
      return;
    }
  } else {
    await saveCloudData(user.id, row?.id);
  }

  const originalSetItem = localStorage.setItem.bind(localStorage);
  let saveTimer;

  localStorage.setItem = function (key, value) {
    originalSetItem(key, value);

    if (Object.values(keys).includes(key)) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        await saveCloudData(user.id, row?.id);
      }, 1000);
    }
  };

  console.log("DukaanSaathi AI Cloud Sync connected.");
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
      .insert(payload);
  }

  if (result.error) {
    console.error("Cloud save failed:", result.error.message);
  } else {
    console.log("Cloud backup saved.");
  }
}

startCloudSync();
