document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("globalModal");
  const fab = document.getElementById("fabBtn");
  const closeModal = document.getElementById("closeModal");
  const modalSecondaryAction = document.getElementById("modalSecondaryAction");
  const modalPrimaryAction = document.getElementById("modalPrimaryAction");

  async function openModal(action, id = "") {
    try {
      await window.adibudgetApp.openModal(action, id);
      modal.classList.remove("hidden");
    } catch (error) {
      window.alert(error.message);
    }
  }

  function closeModalFn() {
    window.adibudgetApp.closeModal();
  }

  if (fab) {
    fab.addEventListener("click", () => {
      openModal("quick-add");
    });
  }

  if (closeModal) {
    closeModal.addEventListener("click", closeModalFn);
  }

  if (modalSecondaryAction) {
    modalSecondaryAction.addEventListener("click", closeModalFn);
  }

  if (modalPrimaryAction) {
    modalPrimaryAction.addEventListener("click", async () => {
      await window.adibudgetApp.submitModal();
    });
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModalFn();
      }
    });
  }

  document.addEventListener("click", async (event) => {
    const openModalBtn = event.target.closest("[data-open-modal]");
    if (openModalBtn) {
      await openModal(openModalBtn.dataset.openModal, openModalBtn.dataset.id || "");
      return;
    }

    const actionBtn = event.target.closest("[data-action]");
    if (actionBtn) {
      try {
        await window.adibudgetApp.handleAction(
          actionBtn.dataset.action,
          actionBtn.dataset.id || ""
        );
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    const openPageBtn = event.target.closest("[data-open-page]");
    if (openPageBtn) {
      window.location.hash = openPageBtn.dataset.openPage;
      return;
    }

    if (event.target.id === "addSplitBtn") {
      window.adibudgetApp.addSplitRow();
      return;
    }

    const removeSplitBtn = event.target.closest("[data-remove-split]");
    if (removeSplitBtn) {
      const row = removeSplitBtn.closest("[data-split-row]");
      const container = document.getElementById("transactionSplitList");
      if (row && container && container.children.length > 1) {
        row.remove();
      }
      return;
    }

    if (event.target.id === "clearTransactionFiltersBtn") {
      window.adibudgetApp.clearTransactionFilters();
      window.adibudgetApp.renderTransactionFilters();
      window.adibudgetApp.renderTransactionsTable();
    }
  });

  document.addEventListener("change", (event) => {
    const filterTarget = event.target.closest("[data-filter]");
    if (filterTarget) {
      window.adibudgetApp.setTransactionFilter(
        filterTarget.dataset.filter,
        filterTarget.value
      );
      return;
    }

    if (
      event.target.matches("[data-transaction-type]") ||
      event.target.matches("[data-recurring-type]")
    ) {
      window.adibudgetApp.syncModalFieldVisibility();
    }
  });
});
