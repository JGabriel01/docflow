/**
 * DocFlow - Theme Switcher (Light / Dark Mode)
 * Suporte a prefers-color-scheme, persistência em localStorage e toggle interativo
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'docflow-theme';

  function getPreferredTheme() {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateToggleButtons(theme);
  }

  function updateToggleButtons(theme) {
    const buttons = document.querySelectorAll('.theme-toggle-btn');
    buttons.forEach((btn) => {
      const darkIcons = btn.querySelectorAll('.theme-icon-dark');
      const lightIcons = btn.querySelectorAll('.theme-icon-light');
      const themeTexts = btn.querySelectorAll('.theme-text');

      if (theme === 'dark') {
        darkIcons.forEach((el) => el.classList.add('d-none'));
        lightIcons.forEach((el) => el.classList.remove('d-none'));
        themeTexts.forEach((el) => (el.textContent = 'Tema Claro'));
        btn.setAttribute('title', 'Alternar para tema claro');
        btn.setAttribute('aria-label', 'Alternar para tema claro');
      } else {
        darkIcons.forEach((el) => el.classList.remove('d-none'));
        lightIcons.forEach((el) => el.classList.add('d-none'));
        themeTexts.forEach((el) => (el.textContent = 'Tema Escuro'));
        btn.setAttribute('title', 'Alternar para tema escuro');
        btn.setAttribute('aria-label', 'Alternar para tema escuro');
      }
    });
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  }

  // Inicialização no DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    const activeTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    applyTheme(activeTheme);

    // Delegação de clique para todos os botões de tema
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleTheme();
      });
    });

    // Ouvir alterações de preferência do sistema operacional
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  });

  // Expor globalmente se necessário
  window.docflowToggleTheme = toggleTheme;
})();
