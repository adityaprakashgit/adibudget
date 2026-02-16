// ============================
// ROUTER
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
}

navItems.forEach(item => {
  item.addEventListener("click", () => {
    loadPage(item.dataset.page);
  });
});

document.addEventListener("DOMContentLoaded", () => {
  loadPage("dashboard");
});
