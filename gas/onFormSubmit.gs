/**
 * Google Apps Script (GAS) Trigger onFormSubmit
 * Pasang di Spreadsheet Google Forms untuk PT 2 KONS Monitoring.
 */

var WEBHOOK_URL = "https://your-domain.com/webhook/form";
var WEBHOOK_SECRET = "pt2_webhook_secret_key";

function onFormSubmit(e) {
  if (!e) return;
  var itemResponses = e.response ? e.response.getItemResponses() : [];
  var payload = {
    tanggal: Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd"),
    teknisi: "",
    sto: "",
    hsa_area: "",
    nama_odp: "",
    tipe_splitter: "1:4",
    ip_olt: "",
    slot_olt: "",
    port_olt: "",
    kapasitas_kabel: "24 Core",
    distribusi: "",
    core_distribusi: "",
    latitude: "",
    longitude: "",
    id_valins: "",
    district: "",
    klasifikasi_eksekutor: "Kemitraan",
    klasifikasi_order: "Reguler",
    no_order: "",
    mitra: "",
    eviden_odp_terbuka: "",
    eviden_odp_tertutup: "",
    eviden_closure: "",
    eviden_foto_lengkap: "",
    eviden_spliter: "",
    eviden_opm1: "",
    eviden_opm2: "",
    url_foto_eviden: "",
    keterangan: "Form submitted via GAS"
  };

  for (var i = 0; i < itemResponses.length; i++) {
    var title = itemResponses[i].getItem().getTitle().toLowerCase().trim();
    var val = itemResponses[i].getResponse();

    if (title.indexOf("teknisi") !== -1) payload.teknisi = val;
    else if (title.indexOf("sto") !== -1) payload.sto = val;
    else if (title.indexOf("odp") !== -1 && title.indexOf("foto") === -1) payload.nama_odp = val;
    else if (title.indexOf("hsa") !== -1) payload.hsa_area = val;
    else if (title.indexOf("ip olt") !== -1) payload.ip_olt = val;
    else if (title.indexOf("slot") !== -1) payload.slot_olt = val;
    else if (title.indexOf("port") !== -1) payload.port_olt = val;
    else if (title.indexOf("valins") !== -1) payload.id_valins = val;
    else if (title.indexOf("mitra") !== -1) payload.mitra = val;
    else if (title.indexOf("eksekutor") !== -1) payload.klasifikasi_eksekutor = val;
    else if (title.indexOf("order") !== -1 && title.indexOf("no") !== -1) payload.no_order = val;
    else if (title.indexOf("foto") !== -1 || title.indexOf("eviden") !== -1) {
      if (!payload.url_foto_eviden) payload.url_foto_eviden = Array.isArray(val) ? val[0] : val;
    }
  }

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-webhook-secret": WEBHOOK_SECRET
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    UrlFetchApp.fetch(WEBHOOK_URL, options);
  } catch (err) {
    Logger.log("Error sending webhook: " + err.toString());
  }
}
