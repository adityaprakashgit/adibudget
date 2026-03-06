document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("globalModal");
  const fab = document.getElementById("fabBtn");
  const closeModal = document.getElementById("closeModal");
  const saveBtn = document.getElementById("saveTransactionBtn");

  async function openModal() {
    try {
      await loadAccounts();
      modal.classList.remove("hidden");
    } catch (error) {
      window.alert(error.message);
    }
  }

  function closeModalFn() {
    modal.classList.add("hidden");
  }

  if (fab) fab.addEventListener("click", openModal);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-modal]");
    if (btn) openModal();
  });

  if (closeModal) closeModal.addEventListener("click", closeModalFn);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModalFn();
    });
  }

  document.addEventListener("submit", (e) => {
    e.preventDefault();
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const type = document.getElementById("transactionType").value;
      const amount = document.getElementById("amountInput").value;
      const category = document.getElementById("categoryInput").value;
      const account_id = document.getElementById("accountSelect").value;

      if (!amount || amount <= 0 || !account_id) {
        return;
      }

      try {
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
      } catch (error) {
        window.alert(error.message);
      }
    });
  }
});
