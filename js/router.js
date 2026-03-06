const content = document.getElementById("content");
const navItems = document.querySelectorAll(".nav-item");
const pageTitle = document.getElementById("pageTitle");

window.currentPage = "dashboard";

function renderPageError(message) {
  content.innerHTML = `
    <div class="card">
      <div class="label">Unable to load data</div>
      <div class="sub">${message}</div>
    </div>
  `;
}

async function loadPage(page) {
  window.currentPage = page;

  const response = await fetch(`pages/${page}.html`);
  const html = await response.text();

  content.innerHTML = html;

  navItems.forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.page === page) {
      item.classList.add("active");
    }
  });

  pageTitle.innerText = page.charAt(0).toUpperCase() + page.slice(1);

  try {
    if (page === "dashboard") {
      await Promise.all([loadTransactionsFromDB(), loadAccounts()]);
      renderDashboardData();
      return;
    }

    if (page === "transactions") {
      await loadTransactionsFromDB();
      renderTransactionsTable();
      return;
    }

    if (page === "accounts") {
      await renderAccountsPage();
      return;
    }

    if (page === "budgets") {
      await renderBudgetsPage();
    }
  } catch (error) {
    renderPageError(error.message);
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const page = item.dataset.page;
    window.location.hash = page;
  });
});

window.addEventListener("hashchange", () => {
  const page = window.location.hash.replace("#", "");
  if (page) {
    loadPage(page);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const pageFromHash = window.location.hash.replace("#", "");
  if (pageFromHash) {
    loadPage(pageFromHash);
  } else {
    loadPage("dashboard");
  }
});
