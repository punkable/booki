/** Dev edition swaps the tan capybara for the blue one. A normal build stays Booki. */
export const devEdition = import.meta.env.VITE_BOOKI_EDITION === "dev";
export const isotype = devEdition ? "/brand/svg/isotype-dev.svg" : "/brand/svg/isotype.svg";
export const appName = devEdition ? "Booki Dev" : "Booki";
