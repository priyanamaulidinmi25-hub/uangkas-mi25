// 1. KONFIGURASI FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyAPdpQl0ZYVhQ1h-Ru6hU3R3LAwoKaQxwY",
  authDomain: "organisasi-pemuda-umpi.firebaseapp.com",
  projectId: "organisasi-pemuda-umpi",
  storageBucket: "organisasi-pemuda-umpi.firebasestorage.app",
  messagingSenderId: "1071806244327",
  appId: "1:1071806244327:web:12fce82da857830fa6c942",
  measurementId: "G-XGB4MEJSDH"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let currentUserData = null;
let isRegisterState = false;
let allUsersMap = {};
let bannerInterval = null;
let chartKeuanganInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  const authSection = document.getElementById("auth-section");
  const mainDashboard = document.getElementById("main-dashboard");
  const authForm = document.getElementById("auth-form");
  const fieldNama = document.getElementById("field-nama");
  const authTitle = document.getElementById("auth-title");
  const btnToggleAuth = document.getElementById("btn-toggle-auth");
  const btnLogout = document.getElementById("btn-logout");
  const userRoleBadge = document.getElementById("user-role-badge");

  initTabNavigation();

  if (btnToggleAuth) {
    btnToggleAuth.addEventListener("click", (e) => {
      e.preventDefault();
      isRegisterState = !isRegisterState;
      authTitle.innerText = isRegisterState ? "Daftar Anggota Baru" : "Masuk ke Aplikasi";
      if (isRegisterState) fieldNama.classList.remove("hidden");
      else fieldNama.classList.add("hidden");

      document.getElementById("btn-auth-submit").innerText = isRegisterState ? "Daftar" : "Masuk";
      document.getElementById("auth-toggle-text").innerText = isRegisterState ? "Sudah punya akun?" : "Belum punya akun?";
      btnToggleAuth.innerText = isRegisterState ? "Masuk" : "Daftar";
    });
  }

  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("input-email").value;
      const password = document.getElementById("input-password").value;
      const nama = document.getElementById("input-nama").value;

      try {
        if (isRegisterState) {
          if (!nama) { alert("Harap isi Nama Lengkap!"); return; }
          const res = await auth.createUserWithEmailAndPassword(email, password);
          await db.collection("users").doc(res.user.uid).set({
            uid: res.user.uid,
            nama: nama,
            email: email,
            role: "anggota",
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          });
          alert("Pendaftaran berhasil!");
        } else {
          await auth.signInWithEmailAndPassword(email, password);
        }
      } catch (err) { alert("Gagal: " + err.message); }
    });
  }

  if (btnLogout) btnLogout.addEventListener("click", () => auth.signOut());

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      try {
        await db.collection("users").doc(user.uid).update({ lastLogin: new Date().toISOString() }).catch(() => {});
        const userDoc = await db.collection("users").doc(user.uid).get();
        currentUserData = userDoc.exists ? userDoc.data() : { nama: user.email, role: "anggota" };
      } catch (err) {
        currentUserData = { nama: user.email, role: "anggota" };
      }

      authSection.classList.add("hidden");
      mainDashboard.classList.remove("hidden");
      btnLogout.classList.remove("hidden");
      userRoleBadge.innerText = `${currentUserData.nama} (${currentUserData.role})`;

      applyRolePermissions(currentUserData.role);
      await fetchUsersList();
      listenDataKas();
      listenBeritaAcara();
      listenMultiRekening();
      listenSetoranPending();
      listenBanners();

      if (currentUserData.role === "admin") {
        document.getElementById("section-sampah")?.classList.remove("hidden");
        document.getElementById("section-admin-banner")?.classList.remove("hidden");
        document.getElementById("section-admin-bugs")?.classList.remove("hidden");
        listenSampahKas();
        listenReportBugsAdmin();
      } else {
        document.getElementById("section-sampah")?.classList.add("hidden");
        document.getElementById("section-admin-banner")?.classList.add("hidden");
        document.getElementById("section-admin-bugs")?.classList.add("hidden");
      }
    } else {
      currentUser = null;
      currentUserData = null;
      authSection.classList.remove("hidden");
      mainDashboard.classList.add("hidden");
      btnLogout.classList.add("hidden");
      userRoleBadge.innerText = "Tamu";
    }
  });
});

// SYSTEM TAB NAVIGATION
function initTabNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      navButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.add('hidden'));

      btn.classList.add('active');
      document.getElementById(targetTab)?.classList.remove('hidden');
    });
  });
}

function applyRolePermissions(role) {
  const isAdminOrMod = role === "admin" || role === "moderator";
  const btnKas = document.getElementById("btn-admin-kas");
  const btnAcara = document.getElementById("btn-admin-acara");
  const btnQris = document.getElementById("btn-admin-qris");

  if (btnKas) btnKas.classList.toggle("hidden", !isAdminOrMod);
  if (btnAcara) btnAcara.classList.toggle("hidden", !isAdminOrMod);
  if (btnQris) btnQris.classList.toggle("hidden", !isAdminOrMod);
}

// BANNER SLIDER DINAMIS
function listenBanners() {
  db.collection("banners").orderBy("created_at", "desc").onSnapshot((snapshot) => {
    const slider = document.getElementById("banner-slider");
    if (!slider) return;

    if (bannerInterval) clearInterval(bannerInterval);

    if (snapshot.empty) {
      slider.innerHTML = `
        <div class="banner-slide">
          <img src="https://i.ibb.co/jvq5FML2/Proyek-Baru-5-165621-F.png" alt="Banner Default">
          <div class="banner-caption">Selamat Datang di Aplikasi Kas MI25 🚀</div>
        </div>`;
      slider.style.transform = `translateX(0%)`;
      return;
    }

    let html = "";
    let count = 0;
    snapshot.forEach(docSnap => {
      count++;
      const item = docSnap.data();
      html += `
        <div class="banner-slide">
          <img src="${item.imageUrl}" alt="${item.caption}">
          <div class="banner-caption">${item.caption}</div>
        </div>`;
    });
    slider.innerHTML = html;

    // Geser otomatis jika lebih dari 1 banner
    if (count > 1) {
      let currentIndex = 0;
      bannerInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % count;
        slider.style.transform = `translateX(-${currentIndex * 100}%)`;
      }, 3500);
    } else {
      slider.style.transform = `translateX(0%)`;
    }
  });
}

// FETCH DAFTAR ANGGOTA (DENGAN FIX BUG DUPLIKASI KODE)
async function fetchUsersList() {
  db.collection("users").onSnapshot((snapshot) => {
    const container = document.getElementById("list-anggota");
    const countBadge = document.getElementById("total-anggota-count");
    if (!container) return;

    // Mengosongkan container agar tidak terduplikasi saat data ter-update
    container.innerHTML = "";
    
    let totalCount = 0;
    allUsersMap = {};

    snapshot.forEach((docSnap) => {
      totalCount++;
      const user = docSnap.data();
      allUsersMap[user.uid] = user.nama;

      const tglLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleDateString("id-ID", { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : "Baru saja";

      container.innerHTML += `
        <div class="user-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f3f4f6;">
          <div>
            <p style="font-weight:bold; color:#1f2937; font-size:13px;">👤 ${user.nama}</p>
            <p style="font-size:10px; color:#9ca3af;">${user.email}</p>
          </div>
          <div style="text-align:right;">
            <span style="font-size:10px; background:#f3f4f6; color:#4b5563; padding:2px 6px; border-radius:4px; font-weight:bold;">${user.role}</span>
            <p style="font-size:9px; color:#10b981; margin-top:2px;">Aktif: ${tglLogin}</p>
          </div>
        </div>`;
    });

    if (countBadge) countBadge.innerText = `${totalCount} Orang`;
  });
}

// LOGIKA TRANSAKSI KAS, STATUS IURAN & CHART VISUAL
function listenDataKas() {
  db.collection("kas").orderBy("tanggal", "desc").onSnapshot((snapshot) => {
    let totalMasuk = 0, totalKeluar = 0;
    const listContainer = document.getElementById("list-transaksi");
    const rekapContainer = document.getElementById("list-rekap-30hari");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const filter = document.getElementById("filter-periode") ? document.getElementById("filter-periode").value : "semua";
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const isAdminOrMod = currentUserData && (currentUserData.role === "admin" || currentUserData.role === "moderator");

    let rekapPemudaMap = {};

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const id = docSnap.id;
      const itemDate = new Date(item.tanggal);

      if (item.tipe === "pemasukan") {
        totalMasuk += Number(item.nominal);
        if (itemDate >= thirtyDaysAgo) {
          const pembayar = item.pembayarNama || "Anonim/Umum";
          rekapPemudaMap[pembayar] = (rekapPemudaMap[pembayar] || 0) + Number(item.nominal);
        }
      }
      if (item.tipe === "pengeluaran") totalKeluar += Number(item.nominal);

      let isPassFilter = true;
      if (filter === "minggu") isPassFilter = ((now - itemDate) / (1000 * 3600 * 24)) <= 7;
      else if (filter === "bulan") isPassFilter = itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
      else if (filter === "tahun") isPassFilter = itemDate.getFullYear() === now.getFullYear();

      if (isPassFilter) {
        const isMasuk = item.tipe === "pemasukan";
        const pembayarInfo = item.pembayarNama ? `<span style="font-size:10px; color:#2563eb; background:#eff6ff; padding:1px 6px; border-radius:4px; font-weight:bold;">Dari: ${item.pembayarNama}</span>` : '';
        const btnHapusKas = isAdminOrMod ? `<button onclick="moveToTrashKas('${id}')" style="background:none; border:none; color:#ef4444; font-size:12px; cursor:pointer; margin-left:8px;" title="Hapus ke Sampah">🗑</button>` : '';

        listContainer.innerHTML += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f3f4f6; font-size:12px;">
            <div>
              <p style="font-weight:bold; color:#1f2937;">${item.keterangan}</p>
              <div style="margin-top:2px;">${pembayarInfo} <span style="font-size:10px; color:#9ca3af;">• ${new Date(item.tanggal).toLocaleDateString("id-ID")}</span></div>
            </div>
            <div style="display:flex; align-items:center;">
              <p style="font-weight:bold; color:${isMasuk ? '#16a34a' : '#dc2626'};">
                ${isMasuk ? '+' : '-'} Rp ${Number(item.nominal).toLocaleString('id-ID')}
              </p>
              ${btnHapusKas}
            </div>
          </div>`;
      }
    });

    document.getElementById("total-masuk").innerText = `Rp ${totalMasuk.toLocaleString('id-ID')}`;
    document.getElementById("total-keluar").innerText = `Rp ${totalKeluar.toLocaleString('id-ID')}`;
    document.getElementById("total-kas").innerText = `Rp ${(totalMasuk - totalKeluar).toLocaleString('id-ID')}`;

    // RENDER CHART VISUAL KEUANGAN
    renderChartKeuangan(totalMasuk, totalKeluar);

    // RENDER STATUS IURAN LUNAS / NUNGGAK PER MAHASISWA
    if (rekapContainer) {
      rekapContainer.innerHTML = "";
      const allMembers = Object.values(allUsersMap);

      if (allMembers.length === 0) {
        rekapContainer.innerHTML = `<p style="font-size: 11px; color: #9ca3af; text-align: center;">Memuat rekapitulasi...</p>`;
      } else {
        allMembers.forEach(nama => {
          const totalBayar = rekapPemudaMap[nama] || 0;
          const isLunas = totalBayar > 0;
          const statusBadge = isLunas ? `<span class="status-badge status-lunas">Lunas 🟢</span>` : `<span class="status-badge status-nunggak">Nunggak 🔴</span>`;

          const btnIngatkanWA = !isLunas ? `
            <button onclick="kirimPengingatWA('${nama}')" style="background:#22c55e; color:white; border:none; padding:3px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; margin-left:6px;">💬 Tagih WA</button>
          ` : '';

          rekapContainer.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f3f4f6;">
              <div>
                <p style="font-weight:bold; color:#334155; font-size:12px;">👤 ${nama}</p>
                <p style="font-size:11px; color:#16a34a; font-weight:bold; margin-top:2px;">Total: Rp ${totalBayar.toLocaleString('id-ID')}</p>
              </div>
              <div style="display:flex; align-items:center;">
                ${statusBadge}
                ${btnIngatkanWA}
              </div>
            </div>`;
        });
      }
    }
  });
}

// FUNCTION CHART.JS FINANSIAL
function renderChartKeuangan(masuk, keluar) {
  const ctx = document.getElementById('chart-keuangan')?.getContext('2d');
  if (!ctx) return;

  if (chartKeuanganInstance) chartKeuanganInstance.destroy();

  chartKeuanganInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Total Pemasukan', 'Total Pengeluaran'],
      datasets: [{
        data: [masuk, keluar],
        backgroundColor: ['#22c55e', '#ef4444'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } }
      }
    }
  });
}

// FUCTION KIRIM PENGINGAT WA
window.kirimPengingatWA = (nama) => {
  const pesan = `Halo ${nama} 😄\nSekadar mengingatkan untuk iuran kas kelas MI25 ya. Kamu bisa langsung bayar online via QRIS DANA & Upload Bukti di aplikasi kas:\nhttps://uangkasmi25.netlify.app\n\nTerima kasih! 🙏`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(pesan)}`, '_blank');
};

// REPORT BUG FORM SUBMIT
document.getElementById('form-report-bug')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pesan = document.getElementById('bug-pesan').value;

  try {
    await db.collection("report_bugs").add({
      namaPengirim: currentUserData?.nama || "Anonim",
      emailPengirim: currentUserData?.email || "-",
      pesan: pesan,
      tanggal: new Date().toISOString()
    });

    alert("Laporan bug / saran berhasil terkirim! Terima kasih bantuanmu.");
    document.getElementById('bug-pesan').value = "";
  } catch (err) {
    alert("Gagal mengirim laporan: " + err.message);
  }
});

// LISTEN REPORT BUGS (KHUSUS ADMIN)
function listenReportBugsAdmin() {
  db.collection("report_bugs").orderBy("tanggal", "desc").onSnapshot((snapshot) => {
    const container = document.getElementById("list-bugs-admin");
    if (!container) return;
    container.innerHTML = "";

    if (snapshot.empty) {
      container.innerHTML = `<p style="font-size: 11px; color: #9ca3af; text-align: center;">Tidak ada laporan bug baru.</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const id = docSnap.id;

      container.innerHTML += `
        <div style="padding: 10px; background: white; border: 1px solid #fed7aa; border-radius: 8px; margin-bottom: 6px; font-size: 11px;">
          <div style="display:flex; justify-content:space-between; font-weight:bold; color:#c2410c;">
            <span>👤 ${item.namaPengirim}</span>
            <span style="font-size:9px; color:#9ca3af;">${new Date(item.tanggal).toLocaleDateString("id-ID")}</span>
          </div>
          <p style="font-size:12px; color:#374151; margin:6px 0;">"${item.pesan}"</p>
          <div style="text-align:right;">
            <button onclick="selesaiBug('${id}')" style="background:#ea580c; color:white; border:none; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:bold; cursor:pointer;">Selesai Perbaiki ✅</button>
          </div>
        </div>`;
    });
  });
}

window.selesaiBug = async (bugId) => {
  if (confirm("Tandai laporan bug ini sudah diperbaiki/selesai?")) {
    await db.collection("report_bugs").doc(bugId).delete();
    alert("Laporan bug dihapus dari daftar.");
  }
};

// MEMINDAHKAN TRANSAKSI KE BERKAS SAMPAH
window.moveToTrashKas = async (kasId) => {
  if (confirm("Pindahkan transaksi ini ke Berkas Sampah?")) {
    try {
      const doc = await db.collection("kas").doc(kasId).get();
      if (doc.exists) {
        const data = doc.data();
        await db.collection("sampah_kas").add({
          ...data,
          deletedBy: currentUserData.nama,
          deletedAt: new Date().toISOString()
        });
        await db.collection("kas").doc(kasId).delete();
        alert("Transaksi dipindahkan ke Berkas Sampah.");
      }
    } catch (err) { alert("Gagal memindahkan: " + err.message); }
  }
};

// LOG BERKAS SAMPAH (KHUSUS ADMIN)
function listenSampahKas() {
  db.collection("sampah_kas").orderBy("deletedAt", "desc").onSnapshot((snapshot) => {
    const container = document.getElementById("list-sampah");
    if (!container) return;
    container.innerHTML = "";

    if (snapshot.empty) {
      container.innerHTML = `<p style="font-size: 11px; color: #9ca3af; text-align: center;">Tidak ada berkas sampah saat ini.</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const id = docSnap.id;

      container.innerHTML += `
        <div style="padding: 8px; background: white; border: 1px solid #fca5a5; border-radius: 8px; margin-bottom: 6px; font-size: 11px;">
          <div style="display:flex; justify-content:space-between; font-weight:bold;">
            <span>${item.keterangan} (Rp ${Number(item.nominal).toLocaleString('id-ID')})</span>
            <span style="color:#dc2626;">Dihapus oleh: ${item.deletedBy}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:6px; align-items:center;">
            <span style="font-size:9px; color:#6b7280;">${new Date(item.deletedAt).toLocaleDateString("id-ID")}</span>
            <div>
              <button onclick="restoreKas('${id}')" style="background:#2563eb; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:10px; cursor:pointer;">↩️ Pulihkan</button>
              <button onclick="deletePermanenKas('${id}')" style="background:#ef4444; color:white; border:none; padding:2px 6px; border-radius:4px; font-size:10px; cursor:pointer; margin-left:4px;">❌ Permanen</button>
            </div>
          </div>
        </div>`;
    });
  });
}

window.restoreKas = async (sampahId) => {
  if (confirm("Pulihkan transaksi ini kembali ke Kas Utama?")) {
    const doc = await db.collection("sampah_kas").doc(sampahId).get();
    if (doc.exists) {
      const data = doc.data();
      delete data.deletedBy;
      delete data.deletedAt;
      await db.collection("kas").add(data);
      await db.collection("sampah_kas").doc(sampahId).delete();
      alert("Transaksi berhasil dipulihkan!");
    }
  }
};

window.deletePermanenKas = async (sampahId) => {
  if (confirm("HAPUS PERMANEN? Data ini tidak bisa dikembalikan lagi!")) {
    await db.collection("sampah_kas").doc(sampahId).delete();
    alert("Data berhasil dihapus permanen.");
  }
};

// MULTI REKENING & QRIS
function listenMultiRekening() {
  db.collection("rekening").orderBy("created_at", "asc").onSnapshot((snapshot) => {
    const container = document.getElementById("list-rekening");
    if (!container) return;
    container.innerHTML = "";

    const isAdminOrMod = currentUserData && (currentUserData.role === "admin" || currentUserData.role === "moderator");

    if (snapshot.empty) {
      container.innerHTML = `<p style="font-size: 12px; color: #9ca3af; text-align: center;">Belum ada metode pembayaran tersimpan.</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const id = docSnap.id;

      const btnHapus = isAdminOrMod ? `<button onclick="deleteRekening('${id}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer;">🗑️ Hapus</button>` : '';

      let qrisHtml = item.qris_url ? `
        <div style="text-align:center; margin-top:8px;">
          <img src="${item.qris_url}" 
               onerror="this.onerror=null; this.src='https://via.placeholder.com/150?text=Gambar+QR+Tidak+Valid';"
               style="width:140px; height:140px; border-radius:8px; border:1px solid #e5e7eb; object-fit:cover;">
          <div><a href="${item.qris_url}" target="_blank" download="QRIS_${item.bank}.png" style="font-size:11px; color:#2563eb; font-weight:bold;">📥 Download / Buka QRIS</a></div>
        </div>` : '';

      container.innerHTML += `
        <div class="bank-card" style="border:1px solid #e5e7eb; padding:12px; border-radius:12px; margin-bottom:8px; background:#fff;">
          <div style="width:100%;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <p style="font-weight:bold; font-size:13px; color:#1f2937;">🏦 ${item.bank}</p>
              ${btnHapus}
            </div>
            <p style="font-size:12px; color:#4b5563; margin-top:2px;">No. Rek: <b>${item.rekening}</b> a.n <b>${item.pemilik || '-'}</b></p>
            ${qrisHtml}
          </div>
        </div>`;
    });
  });
}

window.deleteRekening = async (rekId) => {
  if (confirm("Hapus rekening/QRIS ini?")) {
    await db.collection("rekening").doc(rekId).delete();
    alert("Berhasil dihapus!");
  }
};

// BERITA ACARA
function listenBeritaAcara() {
  db.collection("acara").orderBy("created_at", "desc").onSnapshot((snapshot) => {
    const container = document.getElementById("list-acara");
    if (!container) return;
    container.innerHTML = "";

    const isAdminOrMod = currentUserData && (currentUserData.role === "admin" || currentUserData.role === "moderator");

    snapshot.forEach((docSnap) => {
      const acara = docSnap.data();
      const id = docSnap.id;
      const absensi = acara.absensi || {};
      
      const statusUser = absensi[currentUser.uid] ? absensi[currentUser.uid].status : "Belum Absen";
      let listAbsenHtml = Object.values(absensi).map(a => `<span style="background:#f3f4f6; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:4px;">${a.nama}: <b>${a.status}</b></span>`).join(" ");

      const btnHapusHtml = isAdminOrMod ? `<button onclick="deleteAcara('${id}')" style="background:#ef4444; color:white; border:none; padding:3px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer;">🗑 Hapus</button>` : '';

      container.innerHTML += `
        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:10px; background:#fafafa;">
          <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
              <h4 style="font-weight:bold; font-size:14px; color:#1e3a8a;">${acara.judul}</h4>
              <span style="font-size:10px; background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:10px; font-weight:bold; display:inline-block; margin-top:2px;">${acara.tanggal}</span>
            </div>
            ${btnHapusHtml}
          </div>
          <p style="font-size:12px; color:#4b5563; margin:6px 0 4px 0;">${acara.deskripsi}</p>
          <p style="font-size:10px; color:#9ca3af;">📍 Lokasi: ${acara.lokasi}</p>

          <div style="padding-top:8px; border-top:1px solid #e5e7eb; margin-top:8px;">
            <p style="font-size:10px; font-weight:bold; color:#6b7280; margin-bottom:6px;">Status Kamu: <span style="color:#2563eb;">${statusUser}</span></p>
            <div style="display:flex; gap:8px;">
              <button onclick="submitAbsen('${id}', 'Hadir')" style="flex:1; background:#16a34a; color:white; border:none; padding:6px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">Hadir</button>
              <button onclick="submitAbsen('${id}', 'Tidak Hadir')" style="flex:1; background:#ef4444; color:white; border:none; padding:6px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">Tidak Hadir</button>
            </div>
          </div>

          <div style="padding-top:8px; margin-top:6px;">
            <p style="font-size:10px; color:#9ca3af; margin-bottom:4px;">Rekap Absensi:</p>
            <div>${listAbsenHtml || '<span style="font-size:10px; color:#9ca3af;">Belum ada data</span>'}</div>
          </div>
        </div>`;
    });
  });
}

window.deleteAcara = async (acaraId) => {
  if (confirm("Hapus acara ini?")) {
    await db.collection("acara").doc(acaraId).delete();
    alert("Acara dihapus!");
  }
};

window.submitAbsen = async (acaraId, status) => {
  await db.collection("acara").doc(acaraId).update({
    [`absensi.${currentUser.uid}`]: { nama: currentUserData.nama, status: status }
  });
  alert(`Absensi disimpan: ${status}`);
};

// VERIFIKASI SETORAN PENDING
function listenSetoranPending() {
  const container = document.getElementById("list-verifikasi");
  const section = document.getElementById("section-verifikasi");
  if (!container) return;

  db.collection("setoran_pending")
    .where("status", "==", "pending")
    .onSnapshot((snapshot) => {
      const isAdminOrMod = currentUserData && (currentUserData.role === "admin" || currentUserData.role === "moderator");

      if (snapshot.empty || !isAdminOrMod) {
        container.innerHTML = `<p style="font-size: 12px; color: #9ca3af; text-align: center;">Tidak ada setoran baru.</p>`;
        if (section) section.classList.add("hidden");
        return;
      }

      if (section) section.classList.remove("hidden");

      let html = "";
      snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        const id = docSnap.id;
        html += `
          <div class="verify-item">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px;">
              <span>👤 ${item.namaMahasiswa}</span>
              <span style="color: #16a34a;">Rp ${Number(item.nominal).toLocaleString('id-ID')}</span>
            </div>
            <p style="font-size: 10px; color: #6b7280; margin: 4px 0 8px 0;">
              📅 ${new Date(item.tanggal).toLocaleString('id-ID')}
            </p>
            <img src="${item.buktiGambar}" alt="Bukti Transfer" style="width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px; margin-bottom: 8px; border: 1px solid #e5e7eb; background: #fff;">
            <div style="display: flex; gap: 6px;">
              <button onclick="terimaSetoran('${id}', '${item.namaMahasiswa}', ${item.nominal})" class="btn-success" style="flex: 1;">ACC & Tambah Kas ✅</button>
              <button onclick="tolakSetoran('${id}')" class="btn-danger" style="flex: 1;">Tolak ❌</button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    });
}

window.terimaSetoran = async (docId, nama, nominal) => {
  if (!confirm(`Terima setoran kas sebesar Rp ${Number(nominal).toLocaleString('id-ID')} dari ${nama}?`)) return;

  try {
    await db.collection("kas").add({
      tipe: "pemasukan",
      pembayarNama: nama,
      nominal: Number(nominal),
      keterangan: "Iuran Kas (Transfer QRIS/Bank)",
      tanggal: new Date().toISOString()
    });

    await db.collection("setoran_pending").doc(docId).update({
      status: "diterima"
    });

    const pesanApresiasi = `Makasih ya ${nama} sudah bayar kas 😁\nSemoga rezekinya lancar terus 😇`;
    alert(`🎉 SETORAN DITERIMA!\n\n"${pesanApresiasi}"`);

    if (confirm("Kirim ucapan terima kasih ke grup/kontak WhatsApp?")) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(pesanApresiasi)}`, '_blank');
    }
  } catch (err) {
    alert("Gagal memproses setoran: " + err.message);
  }
};

window.tolakSetoran = async (docId) => {
  if (!confirm("Tolak bukti pembayaran ini?")) return;

  try {
    await db.collection("setoran_pending").doc(docId).update({
      status: "ditolak"
    });
    alert("Setoran berhasil ditolak.");
  } catch (err) {
    alert("Gagal menolak setoran: " + err.message);
  }
};

// MODAL CONTROLLER
const modalContainer = document.getElementById("modal-container");
const modalTitle = document.getElementById("modal-title");
const modalFields = document.getElementById("modal-fields");
const modalForm = document.getElementById("modal-form");
const modalShareWA = document.getElementById("modal-share-wa");
const btnTriggerWA = document.getElementById("btn-trigger-wa");
let activeModalType = "";

if (document.getElementById("btn-close-modal")) {
  document.getElementById("btn-close-modal").onclick = () => modalContainer.classList.add("hidden");
}

if (document.getElementById("btn-bayar-online")) {
  document.getElementById("btn-bayar-online").onclick = () => {
    activeModalType = "bayar_online";
    modalTitle.innerText = "💸 Upload Bukti Bayar Kas";
    modalShareWA.classList.add("hidden");

    const namaDefault = currentUserData ? currentUserData.nama : "";

    modalFields.innerHTML = `
      <div class="form-group">
        <label>Nama Mahasiswa</label>
        <input type="text" id="setor-nama" class="form-control" value="${namaDefault}" required placeholder="Nama Pembayar">
      </div>
      <div class="form-group">
        <label>Nominal Pembayaran (Rp)</label>
        <input type="number" id="setor-nominal" class="form-control" placeholder="Contoh: 10000" required>
      </div>
      <div class="form-group">
        <label>Foto / Screenshot Bukti Transfer</label>
        <input type="file" id="setor-file" class="form-control" accept="image/*" required>
      </div>
    `;
    modalContainer.classList.remove("hidden");
  };
}

if (document.getElementById("btn-admin-kas")) {
  document.getElementById("btn-admin-kas").onclick = () => {
    activeModalType = "kas";
    modalTitle.innerText = "Catat Transaksi Kas Manual";
    modalShareWA.classList.add("hidden");

    let optionsUser = `<option value="">-- Bukan Iuran Anggota / Kas Umum --</option>`;
    Object.values(allUsersMap).forEach(nama => {
      optionsUser += `<option value="${nama}">${nama}</option>`;
    });

    modalFields.innerHTML = `
      <div class="form-group"><label>Jenis Transaksi</label><select id="m-tipe" class="form-control"><option value="pemasukan">Pemasukan (+)</option><option value="pengeluaran">Pengeluaran (-)</option></select></div>
      <div class="form-group"><label>Nama Pembayar (Khusus Pemasukan)</label><select id="m-pembayar" class="form-control">${optionsUser}</select></div>
      <div class="form-group"><label>Nominal (Rp)</label><input type="number" id="m-nominal" required class="form-control"></div>
      <div class="form-group"><label>Keterangan Transaksi</label><input type="text" id="m-keterangan" required placeholder="Contoh: Uang Iuran Mingguan" class="form-control"></div>`;
    modalContainer.classList.remove("hidden");
  };
}

if (document.getElementById("btn-admin-acara")) {
  document.getElementById("btn-admin-acara").onclick = () => {
    activeModalType = "acara";
    modalTitle.innerText = "Buat Berita Acara Baru";
    modalShareWA.classList.add("hidden");
    modalFields.innerHTML = `
      <div class="form-group"><label>Judul Acara</label><input type="text" id="m-judul" required class="form-control"></div>
      <div class="form-group"><label>Tanggal & Waktu</label><input type="text" id="m-tgl" placeholder="Minggu, 25 Okt 09.00 WIB" required class="form-control"></div>
      <div class="form-group"><label>Lokasi</label><input type="text" id="m-lokasi" required class="form-control"></div>
      <div class="form-group"><label>Deskripsi</label><textarea id="m-deskripsi" class="form-control"></textarea></div>`;
    modalContainer.classList.remove("hidden");
  };
}

if (document.getElementById("btn-admin-qris")) {
  document.getElementById("btn-admin-qris").onclick = () => {
    activeModalType = "qris";
    modalTitle.innerText = "Tambah Rekening / E-Wallet";
    modalShareWA.classList.add("hidden");
    modalFields.innerHTML = `
      <div class="form-group"><label>Nama Bank / E-Wallet</label><input type="text" id="m-bank" placeholder="Contoh: BCA / DANA / QRIS" required class="form-control"></div>
      <div class="form-group"><label>Nomor Rekening / HP</label><input type="text" id="m-rek" required class="form-control"></div>
      <div class="form-group"><label>Atas Nama (Pemilik)</label><input type="text" id="m-pemilik" placeholder="Contoh: Bendahara MI25" class="form-control"></div>
      <div class="form-group">
        <label>Upload Foto QRIS dari HP</label>
        <input type="file" id="m-qris-file" accept="image/*" class="form-control" style="margin-bottom:6px;">
        <label style="font-size:11px; color:#6b7280;">Atau Masukkan URL Link Gambar (Opsional):</label>
        <input type="text" id="m-qris-url" placeholder="https://i.ibb.co/..." class="form-control">
      </div>`;
    modalContainer.classList.remove("hidden");
  };
}

if (document.getElementById("btn-admin-banner")) {
  document.getElementById("btn-admin-banner").onclick = () => {
    activeModalType = "banner";
    modalTitle.innerText = "Tambah Banner Promo / Informasi";
    modalShareWA.classList.add("hidden");
    modalFields.innerHTML = `
      <div class="form-group"><label>Judul / Teks Caption Banner</label><input type="text" id="m-banner-caption" placeholder="Contoh: Agenda Makrab MI25 Pekan Depan!" required class="form-control"></div>
      <div class="form-group">
        <label>Upload Foto Banner dari HP</label>
        <input type="file" id="m-banner-file" accept="image/*" class="form-control">
      </div>`;
    modalContainer.classList.remove("hidden");
  };
}

if (modalForm) {
  modalForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (activeModalType === "bayar_online") {
      const nama = document.getElementById("setor-nama").value;
      const nominal = Number(document.getElementById("setor-nominal").value);
      const fileInput = document.getElementById("setor-file").files[0];

      if (!fileInput) { alert("Pilih foto bukti transfer terlebih dahulu!"); return; }

      const reader = new FileReader();
      reader.onload = async function(evt) {
        const base64Image = evt.target.result;
        try {
          await db.collection("setoran_pending").add({
            namaMahasiswa: nama,
            nominal: nominal,
            buktiGambar: base64Image,
            status: "pending",
            tanggal: new Date().toISOString()
          });

          alert("Bukti pembayaran berhasil diunggah! Menunggu verifikasi bendahara.");
          modalContainer.classList.add("hidden");
        } catch (err) {
          alert("Gagal mengunggah bukti: " + err.message);
        }
      };
      reader.readAsDataURL(fileInput);

    } else if (activeModalType === "kas") {
      const tipe = document.getElementById("m-tipe").value;
      const pembayarNama = document.getElementById("m-pembayar").value || "";
      const nominal = Number(document.getElementById("m-nominal").value);
      const keterangan = document.getElementById("m-keterangan").value;

      await db.collection("kas").add({
        tipe: tipe,
        pembayarNama: pembayarNama,
        nominal: nominal,
        keterangan: keterangan,
        tanggal: new Date().toISOString()
      });

      modalContainer.classList.add("hidden");

      if (tipe === "pemasukan") {
        const namaTarget = pembayarNama ? pembayarNama : "Kawan";
        const pesanApresiasi = `Makasih ya ${namaTarget} sudah bayar 😁\nSemoga rezekinya lancar terus 😇`;

        alert(`🎉 TRANSAKSI BERHASIL!\n\n"${pesanApresiasi}"`);

        if (confirm("Ingin kirim pesan ucapan terima kasih ini ke WhatsApp?")) {
          window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(pesanApresiasi)}`, '_blank');
        }
      } else {
        alert("Pengeluaran kas berhasil dicatat!");
      }

    } else if (activeModalType === "acara") {
      const judul = document.getElementById("m-judul").value;
      const tgl = document.getElementById("m-tgl").value;
      const lokasi = document.getElementById("m-lokasi").value;
      const deskripsi = document.getElementById("m-deskripsi").value;

      await db.collection("acara").add({
        judul: judul, tanggal: tgl, lokasi: lokasi, deskripsi: deskripsi,
        created_at: new Date().toISOString(), absensi: {}
      });

      modalShareWA.classList.remove("hidden");
      const pesanWA = `📢 *BERITA ACARA KELAS MI25*\n\n📌 *Acara:* ${judul}\n📅 *Waktu:* ${tgl}\n📍 *Lokasi:* ${lokasi}\n📝 *Detail:* ${deskripsi}\n\nMohon konfirmasi absensi via aplikasi!`;
      btnTriggerWA.onclick = () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(pesanWA)}`, '_blank');

    } else if (activeModalType === "qris") {
      const bank = document.getElementById("m-bank").value;
      const rek = document.getElementById("m-rek").value;
      const pemilik = document.getElementById("m-pemilik").value;
      let qrisUrl = document.getElementById("m-qris-url").value.trim();
      const fileInput = document.getElementById("m-qris-file").files[0];

      const simpanKeDb = async (urlGambar) => {
        await db.collection("rekening").add({
          bank: bank,
          rekening: rek,
          pemilik: pemilik,
          qris_url: urlGambar,
          created_at: new Date().toISOString()
        });
        modalContainer.classList.add("hidden");
        alert("Rekening / QRIS berhasil disimpan!");
      };

      if (fileInput) {
        const reader = new FileReader();
        reader.onload = async function(evt) {
          await simpanKeDb(evt.target.result);
        };
        reader.readAsDataURL(fileInput);
      } else {
        await simpanKeDb(qrisUrl);
      }

    } else if (activeModalType === "banner") {
      const caption = document.getElementById("m-banner-caption").value;
      const fileInput = document.getElementById("m-banner-file").files[0];

      if (!fileInput) { alert("Pilih foto banner!"); return; }

      const reader = new FileReader();
      reader.onload = async function(evt) {
        await db.collection("banners").add({
          caption: caption,
          imageUrl: evt.target.result,
          created_at: new Date().toISOString()
        });
        modalContainer.classList.add("hidden");
        alert("Banner berhasil ditambahkan!");
      };
      reader.readAsDataURL(fileInput);
    }
  });
}
