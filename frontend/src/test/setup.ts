import "@testing-library/jest-dom/vitest";

// jsdom has no scrolling; forms scroll to the confirmation after submitting.
window.scrollTo = () => {};
