# Project Overview

This project is a template for creating a "digital garden" using the [Eleventy](https://www.11ty.dev/) static site generator and the [Digital Garden Obsidian Plugin](https://github.com/oleeskild/Obsidian-Digital-Garden). It is designed to publish notes from an Obsidian vault to a website.

The project is built with Node.js and uses a variety of `markdown-it` plugins to extend Markdown capabilities, including support for footnotes, task checkboxes, and diagrams. It also includes features like a table of contents, RSS feeds, and image optimization.

The site's styling is done with Sass, and the project includes scripts for compiling it to CSS.

# Building and Running

To get started with this project, you'll need to have Node.js and npm installed.

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Run in development mode:**
    This command will start a local development server with hot-reloading.
    ```bash
    npm start
    ```

3.  **Build for production:**
    This command will build the site for production. The output will be in the `dist` directory.
    ```bash
    npm run build
    ```

# Development Conventions

*   **Configuration:** The main configuration for the Eleventy site is in `.eleventy.js`. User-specific customizations can be added in `src/helpers/userSetup.js`.
*   **Content:** The notes are located in `src/site/notes`.
*   **Styling:** The main stylesheet is `src/site/styles/style.scss`. Custom styles can be added in `src/site/styles/custom-style.scss`.
*   **Templates:** The site's templates are written in Nunjucks and are located in `src/site/_includes`.
*   **Helpers:** Utility functions and helpers are located in `src/helpers`.
