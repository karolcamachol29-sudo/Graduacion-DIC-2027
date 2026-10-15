/**
 * GRADUACIÓN FIQ DICIEMBRE 2027 — SCRIPT DE NAVEGACIÓN Y EXPERIENCIA INTERACTIVA
 * Manejo de Navbar Sticky, Menú Móvil Accesible, Rutas Activas y Filtros.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elementos principales
  const header = document.querySelector('.site-header');
  const navLinks = document.querySelectorAll('.nav-link');
  const mobileToggle = document.querySelector('.mobile-toggle');
  const navMenuWrapper = document.querySelector('.nav-menu-wrapper');

  /* ------------------------------------------------------------------------
     1. EFECTO SCROLL EN NAVBAR (Blur & Sombra Dinámica)
     ------------------------------------------------------------------------ */
  const handleScroll = () => {
    if (window.scrollY > 20) {
      header && header.classList.add('is-scrolled');
    } else {
      header && header.classList.remove('is-scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Verificación inicial

  /* ------------------------------------------------------------------------
     2. MENÚ MÓVIL ACCESIBLE
     ------------------------------------------------------------------------ */
  if (mobileToggle && navMenuWrapper) {
    const toggleMenu = (open) => {
      const isOpen = open !== undefined ? open : !mobileToggle.classList.contains('is-open');
      mobileToggle.classList.toggle('is-open', isOpen);
      navMenuWrapper.classList.toggle('is-open', isOpen);
      mobileToggle.setAttribute('aria-expanded', isOpen.toString());
      document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    mobileToggle.addEventListener('click', () => {
      toggleMenu();
    });

    // Cerrar menú al hacer clic en cualquier enlace de navegación
    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1100) {
          toggleMenu(false);
        }
      });
    });

    // Cerrar al presionar la tecla Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileToggle.classList.contains('is-open')) {
        toggleMenu(false);
      }
    });

    // Cerrar al redimensionar a pantalla de escritorio
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1100 && mobileToggle.classList.contains('is-open')) {
        toggleMenu(false);
      }
    });
  }

  /* ------------------------------------------------------------------------
     3. DETECCIÓN AUTOMÁTICA DE PÁGINA ACTIVA EN NAVBAR
     ------------------------------------------------------------------------ */
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  navLinks.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;

    // Normalizar href eliminando hash inicial si existe
    const targetFile = href.split('#')[0];

    if (
      (currentPath === '' || currentPath === 'index.html') &&
      (targetFile === 'index.html' || targetFile === '' || href.startsWith('#'))
    ) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    } else if (targetFile && currentPath.endsWith(targetFile)) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('is-active');
      link.removeAttribute('aria-current');
    }
  });

  /* ------------------------------------------------------------------------
     4. SCROLL SUAVE PARA ENLACES ANCLA DENTRO DE LA MISMA PÁGINA
     ------------------------------------------------------------------------ */
  const localAnchorLinks = document.querySelectorAll('a[href^="#"]');

  localAnchorLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const rawTargetId = link.getAttribute('href');
      if (rawTargetId && rawTargetId.length > 1) {
        const targetElement = document.querySelector(rawTargetId);
        if (targetElement) {
          e.preventDefault();
          const headerHeight = header ? (header.offsetHeight || 76) : 76;
          const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;

          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });

          if (history.pushState) {
            history.pushState(null, null, rawTargetId);
          }
        }
      }
    });
  });

  /* ------------------------------------------------------------------------
     5. FILTRO INTERACTIVO PARA LA TABLA COMPARATIVA DE PROVEEDORES
     ------------------------------------------------------------------------ */
  const filterButtons = document.querySelectorAll('.filter-btn');
  const comparisonRows = document.querySelectorAll('#comparison-table tbody tr');

  if (filterButtons.length > 0 && comparisonRows.length > 0) {
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');

        // Cambiar estado activo en botones
        filterButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        // Filtrar filas de la tabla
        comparisonRows.forEach((row) => {
          const category = row.getAttribute('data-category') || '';
          if (filter === 'all') {
            row.style.display = '';
          } else if (category.includes(filter)) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      });
    });
  }
});
