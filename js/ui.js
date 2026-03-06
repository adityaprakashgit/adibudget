// ======================================
// PERSONAL CFO - UI CONTROLLER (REAL)
// ======================================

document.addEventListener("DOMContentLoaded", () => {

  const modal = document.getElementById("globalModal");
  const fab = document.getElementById("fabBtn");
  const closeModal = document.getElementById("closeModal");
  const saveBtn = document.getElementById("saveTransactionBtn");

  function openModal() {
    modal.classList.remove("hidden");
    loadAccounts(); // 🔥 load accounts into dropdown when opening
  }

  function closeModalFn() {
    modal.classList.add("hidden");
  }

  // FAB
  if (fab) fab.addEventListener("click", openModal);

  // Dynamic Add button
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-open-modal]");
    if (btn) openModal();
  });

  // Close modal
  if (closeModal) closeModal.addEventListener("click", closeModalFn);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModalFn();
    });
  }

  // Prevent form submit
  document.addEventListener("submit", function (e) {
    e.preventDefault();
  });

  // ======================================
  // SAVE TRANSACTION (WITH ACCOUNT)
  // ======================================

  if (saveBtn) {

    saveBtn.addEventListener("click", async (e) => {

      e.preventDefault();
      e.stopPropagation();

      const type = document.getElementById("transactionType").value;
      const amount = document.getElementById("amountInput").value;
      const category = document.getElementById("categoryInput").value;
      const account_id = document.getElementById("accountSelect").value;

      if (!amount || amount <= 0 || !account_id) return;

      await addTransaction(type, amount, category, account_id);

      await loadTransactionsFromDB();
      await loadAccounts();

      if (window.currentPage === "dashboard") {
        renderDashboardData();
      }

      if (window.currentPage === "transactions") {
        renderTransactionsTable();
      }

      if (window.currentPage === "accounts") {
        renderAccountsPage();
      }

      document.getElementById("amountInput").value = "";
      closeModalFn();

    });

  }

});
