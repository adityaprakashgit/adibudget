const content = document.getElementById("content");
const navItems = document.querySelectorAll(".nav-item");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

window.currentPage = "dashboard";

function renderPageError(message) {
  content.innerHTML = `
    <div class="card">
      <div class="label">Unable to load page</div>
      <div class="sub">${message}</div>
    </div>
  `;
}

async function loadPage(page) {
  window.currentPage = page;
  const meta = window.adibudgetApp.getPageTitle(page);

  pageTitle.textContent = meta.title;
  pageSubtitle.textContent = meta.subtitle || "";
  content.innerHTML = window.adibudgetApp.renderLoadingState(
    `Loading ${meta.title}`,
    "Pulling the latest data through the AdiBudget backend."
  );

  const response = await fetch(`pages/${page}.html`);

  if (!response.ok) {
    throw new Error(`Unable to load page fragment for ${page}`);
  }

  const html = await response.text();
  content.innerHTML = html;

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  pageTitle.textContent = meta.title;
  pageSubtitle.textContent = meta.subtitle || "";

  await window.adibudgetApp.loadPageData(page);
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    window.location.hash = item.dataset.page;
  });
});

window.addEventListener("hashchange", async () => {
  const page = window.location.hash.replace("#", "") || "dashboard";

  try {
    await loadPage(page);
  } catch (error) {
    renderPageError(error.message);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const pageFromHash = window.location.hash.replace("#", "") || "dashboard";

  try {
    await window.adibudgetApp.loadHealth();
    await loadPage(pageFromHash);
  } catch (error) {
    renderPageError(error.message);
  }
});
