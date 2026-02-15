// This file handles all database interactions.
// Currently mock. Later we connect to Neon.

export async function saveTransaction(data) {
    console.log("Mock Save:", data);

    // Simulate API delay
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ success: true });
        }, 300);
    });
}
