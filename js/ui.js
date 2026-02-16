document.addEventListener("DOMContentLoaded", () => {

  const modal = document.getElementById("globalModal");
  const fab = document.getElementById("fabBtn");
  const closeModal = document.getElementById("closeModal");
  const saveBtn = document.getElementById("saveTransactionBtn");

  function openModal() {
    modal.classList.remove("hidden");
  }

  function closeModalFn() {
    modal.classList.add("hidden");
  }

  fab.addEventListener("click", openModal);
  closeModal.addEventListener("click", closeModalFn);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModalFn();
  });

  saveBtn.addEventListener("click", async () => {

    const type = document.getElementById("transactionType").value;
    const amount = document.getElementById("amountInput").value;
    const category = document.getElementById("categoryInput").value;

    if (!amount) return;

    await addTransaction(type, amount, category);

    closeModalFn();
    document.getElementById("amountInput").value = "";

    loadPage(window.currentPage);
  });
});
