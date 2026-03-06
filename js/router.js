// ============================
// ROUTER (FULL + ACCOUNTS)
// ============================

const content = document.getElementById("content");
const navItems = document.querySelectorAll(".nav-item");
const pageTitle = document.getElementById("pageTitle");

window.currentPage = "dashboard";

async function loadPage(page) {

  window.currentPage = page;

  const response = await fetch(`pages/${page}.html`);
  const html = await response.text();

  content.innerHTML = html;

  navItems.forEach(item => {
    item.classList.remove("active");
    if (item.dataset.page === page) {
      item.classList.add("active");
    }
  });

  pageTitle.innerText =
    page.charAt(0).toUpperCase() + page.slice(1);

  await loadTransactionsFromDB();

  if (page === "dashboard") renderDashboardData();
  if (page === "transactions") renderTransactionsTable();
  if (page === "accounts") renderAccountsPage();
}

navItems.forEach(item => {
  item.addEventListener("click", () => {
    const page = item.dataset.page;
    window.location.hash = page;
  });
});

window.addEventListener("hashchange", () => {
  const page = window.location.hash.replace("#", "");
  if (page) loadPage(page);
});

document.addEventListener("DOMContentLoaded", () => {
  const pageFromHash = window.location.hash.replace("#", "");
  if (pageFromHash) {
    loadPage(pageFromHash);
  } else {
    loadPage("dashboard");
  }
});
