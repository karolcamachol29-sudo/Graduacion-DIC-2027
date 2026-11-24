/**
 * GRADUACIÓN FIQ BUAP DICIEMBRE 2027
 * Controlador Interactivo del Carrusel Hero (Slider Ejecutivo)
 * - Autoplay cada 5500ms
 * - Pausa al pasar el cursor (hover) y al enfocar con teclado (focus)
 * - Navegación manual con flechas, botones e indicadores tipo pill
 * - Barra de progreso sincronizada
 * - Soporte para gestos táctiles (Swipe en móviles iOS / Android)
 * - Navegación con teclado accesible (Flechas izquierda/derecha)
 */

document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('hero-executive-slider');
  if (!slider) return;

  const slides = slider.querySelectorAll('.hero-slide');
  const prevBtn = slider.querySelector('#slider-btn-prev');
  const nextBtn = slider.querySelector('#slider-btn-next');
  const indicators = slider.querySelectorAll('.indicator-pill');
  const counterCurrent = slider.querySelector('#slider-counter-current');
  const counterTotal = slider.querySelector('#slider-counter-total');
  const autoplayStatus = slider.querySelector('#autoplay-status-text');

  if (!slides.length) return;

  const SLIDE_DURATION = 5500; // 5.5 segundos por diapositiva
  let currentIndex = 0;
  let autoplayTimer = null;
  let progressTimer = null;
  let progressStartTime = 0;
  let isPaused = false;
  let progressPercent = 0;

  if (counterTotal) {
    counterTotal.textContent = String(slides.length).padStart(2, '0');
  }

  // Actualizar diapositiva activa
  const showSlide = (index) => {
    // Normalizar índice
    if (index < 0) {
      index = slides.length - 1;
    } else if (index >= slides.length) {
      index = 0;
    }

    currentIndex = index;

    // Cambiar clases en slides
    slides.forEach((slide, i) => {
      const isActive = i === currentIndex;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', (!isActive).toString());
      if (isActive) {
        slide.removeAttribute('tabindex');
      } else {
        slide.setAttribute('tabindex', '-1');
      }
    });

    // Actualizar indicadores tipo pill
    indicators.forEach((indicator, i) => {
      const isActive = i === currentIndex;
      indicator.classList.toggle('is-active', isActive);
      indicator.setAttribute('aria-selected', isActive.toString());
      const fillBar = indicator.querySelector('.indicator-progress-fill');
      if (fillBar) {
        fillBar.style.width = isActive ? '0%' : (i < currentIndex ? '100%' : '0%');
      }
    });

    // Actualizar contador
    if (counterCurrent) {
      counterCurrent.textContent = String(currentIndex + 1).padStart(2, '0');
    }

    // Reiniciar barra de progreso y temporizador
    resetProgress();
  };

  // Siguiente diapositiva
  const nextSlide = () => {
    showSlide(currentIndex + 1);
  };

  // Diapositiva anterior
  const prevSlide = () => {
    showSlide(currentIndex - 1);
  };

  // Control de Progreso y Autoplay
  const resetProgress = () => {
    progressPercent = 0;
    progressStartTime = Date.now();
    updateProgressFill(0);

    if (autoplayTimer) {
      clearTimeout(autoplayTimer);
    }
    if (progressTimer) {
      cancelAnimationFrame(progressTimer);
    }

    if (!isPaused) {
      startProgressLoop();
      autoplayTimer = setTimeout(() => {
        nextSlide();
      }, SLIDE_DURATION);
    }
  };

  const updateProgressFill = (percent) => {
    const activeIndicator = indicators[currentIndex];
    if (activeIndicator) {
      const fillBar = activeIndicator.querySelector('.indicator-progress-fill');
      if (fillBar) {
        fillBar.style.width = `${Math.min(percent, 100)}%`;
      }
    }
  };

  const startProgressLoop = () => {
    const loop = () => {
      if (isPaused) return;
      const elapsed = Date.now() - progressStartTime;
      progressPercent = (elapsed / SLIDE_DURATION) * 100;
      updateProgressFill(progressPercent);

      if (elapsed < SLIDE_DURATION) {
        progressTimer = requestAnimationFrame(loop);
      }
    };
    progressTimer = requestAnimationFrame(loop);
  };

  const pauseAutoplay = () => {
    if (isPaused) return;
    isPaused = true;
    if (autoplayTimer) clearTimeout(autoplayTimer);
    if (progressTimer) cancelAnimationFrame(progressTimer);
    if (autoplayStatus) autoplayStatus.textContent = 'En pausa';
  };

  const resumeAutoplay = () => {
    if (!isPaused) return;
    isPaused = false;
    const remainingTime = Math.max(SLIDE_DURATION * (1 - progressPercent / 100), 500);
    progressStartTime = Date.now() - (progressPercent / 100) * SLIDE_DURATION;
    startProgressLoop();
    autoplayTimer = setTimeout(() => {
      nextSlide();
    }, remainingTime);
    if (autoplayStatus) autoplayStatus.textContent = 'Autoplay';
  };

  // Event Listeners para Controles Manuales
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      prevSlide();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      nextSlide();
    });
  }

  // Clic en indicadores
  indicators.forEach((indicator, i) => {
    indicator.addEventListener('click', (e) => {
      e.preventDefault();
      showSlide(i);
    });
  });

  // Pausar al pasar el ratón (hover) o dar foco
  slider.addEventListener('mouseenter', pauseAutoplay);
  slider.addEventListener('mouseleave', resumeAutoplay);
  slider.addEventListener('focusin', pauseAutoplay);
  slider.addEventListener('focusout', resumeAutoplay);

  // Navegación con teclado cuando el slider tiene foco
  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    }
  });

  // Soporte de Gestos Táctiles (Swipe para móviles)
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  slider.addEventListener('touchstart', (e) => {
    if (e.changedTouches.length === 1) {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }
  }, { passive: true });

  slider.addEventListener('touchend', (e) => {
    if (e.changedTouches.length === 1) {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleGesture();
    }
  }, { passive: true });

  const handleGesture = () => {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // Solo considerar swipe horizontal si el desplazamiento en X es mayor que en Y
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
      if (diffX < 0) {
        // Swipe izquierda -> Siguiente
        nextSlide();
      } else {
        // Swipe derecha -> Anterior
        prevSlide();
      }
    }
  };

  // Iniciar carrusel
  showSlide(0);
});
