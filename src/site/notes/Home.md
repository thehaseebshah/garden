---
title: Haseeb Shah
permalink: /
dgShowInlineTitle: false
---

<div class="homepage">
  <!-- Hero Section -->
  <section class="hero" data-parallax="0.3">
    <div class="hero-content">
      <div class="hero-badge">👋 Welcome</div>
      <h1 class="hero-title">
        <span class="gradient-text">Haseeb Shah</span>
      </h1>
      <p class="hero-tagline">
        <span class="typewriter-wrapper">
          <span class="typewriter-text"></span>
          <span class="typewriter-cursor">|</span>
        </span>
      </p>
      <div class="hero-cta">
        <a href="#explore" class="cta-button primary">
          <span>Explore</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
        <a href="#about" class="cta-button secondary">About Me</a>
      </div>
    </div>
  </section>

  <!-- Scroll Indicator (positioned fixed) -->
  <div class="scroll-indicator">
    <div class="mouse">
      <div class="wheel"></div>
    </div>
    <span>Scroll</span>
  </div>

  <!-- Featured Section -->
  <section class="featured" id="explore" data-parallax="0.1">
    <h2 class="section-title reveal">
      <span class="title-decoration"></span>
      Featured
      <span class="title-decoration"></span>
    </h2>
    <div class="card-grid">
      <a href="/keep/my-marriage-research-resources/" class="feature-card reveal">
        <div class="card-glow"></div>
        <div class="card-icon">💍</div>
        <h3>Marriage Research</h3>
        <p>Resources and insights for building a strong foundation</p>
        <span class="card-arrow">→</span>
      </a>
      <a href="/keep/shirt-ideas/" class="feature-card reveal">
        <div class="card-glow"></div>
        <div class="card-icon">👕</div>
        <h3>Shirt Ideas</h3>
        <p>Creative designs and fashion inspiration</p>
        <span class="card-arrow">→</span>
      </a>
      <div class="feature-card coming-soon reveal">
        <div class="card-glow"></div>
        <div class="card-icon">🌱</div>
        <h3>More Coming Soon</h3>
        <p>Always building, always learning...</p>
      </div>
    </div>
  </section>

  <!-- About Section -->
  <section class="about-section" id="about" data-parallax="0.05">
    <div class="about-content reveal">
      <h2 class="section-title">Welcome</h2>
      <p>Hey, I'm Haseeb! This is my personal corner of the internet — a space where I share ideas, projects, and things I'm learning along the way.</p>
      <p>Feel free to explore and discover something new. If you'd like to connect, reach out below!</p>
    </div>
  </section>

  <!-- Connect Section -->
  <section class="connect-section">
    <h2 class="section-title reveal">Let's Connect</h2>
    <div class="social-links reveal">
      <a href="mailto:info@thehaseebshah.com" class="social-link">
        <span class="social-icon">✉️</span>
        <span>Email</span>
      </a>
      <a href="https://github.com/thehaseebshah" class="social-link" target="_blank">
        <span class="social-icon">💻</span>
        <span>GitHub</span>
      </a>
    </div>
  </section>
</div>

<script>
// ============================================
// PARALLAX & REVEAL ANIMATIONS
// ============================================
function handleScroll() {
  const scrollY = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  
  // Hide scroll indicator when scrolling
  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator) {
    const hide = scrollY > 50;
    scrollIndicator.style.opacity = hide ? '0' : '1';
    scrollIndicator.style.visibility = hide ? 'hidden' : 'visible';
    scrollIndicator.style.pointerEvents = hide ? 'none' : 'auto';
  }
  
  // Parallax
  document.querySelectorAll('[data-parallax]').forEach(el => {
    const speed = parseFloat(el.dataset.parallax);
    el.style.transform = `translateY(${scrollY * speed}px)`;
  });
  
  // Staggered reveal on scroll
  document.querySelectorAll('.reveal:not(.revealed)').forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    const visible = rect.top < window.innerHeight - 100;
    if (visible) {
      setTimeout(() => {
        el.classList.add('revealed');
      }, index * 100); // Stagger by 100ms each
    }
  });
}

// ============================================
// MAGNETIC BUTTON EFFECT
// ============================================
function initMagneticButtons() {
  const buttons = document.querySelectorAll('.cta-button');
  
  buttons.forEach(button => {
    button.addEventListener('mousemove', e => {
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      button.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translate(0, 0)';
    });
  });
}

// ============================================
// SOCIAL LINKS MAGNETIC EFFECT
// ============================================
function initMagneticSocialLinks() {
  const links = document.querySelectorAll('.social-link');
  
  links.forEach(link => {
    link.addEventListener('mousemove', e => {
      const rect = link.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      link.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px) scale(1.05)`;
    });
    
    link.addEventListener('mouseleave', () => {
      link.style.transform = 'translate(0, 0) scale(1)';
    });
  });
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Ensure scroll indicator is visible on load
  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator && window.scrollY <= 50) {
    scrollIndicator.style.opacity = '1';
    scrollIndicator.style.visibility = 'visible';
  }
  
  handleScroll();
  
  // Initialize interactive effects
  initMagneticButtons();
  initMagneticSocialLinks();
  
  // ============================================
  // TYPEWRITER ANIMATION
  // ============================================
  const words = ['Developer', 'Creator', 'Lifelong Learner'];
  const typewriterText = document.querySelector('.typewriter-text');
  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typeSpeed = 100;
  
  function typeWriter() {
    const currentWord = words[wordIndex];
    
    if (isDeleting) {
      typewriterText.textContent = currentWord.substring(0, charIndex - 1);
      charIndex--;
      typeSpeed = 50;
    } else {
      typewriterText.textContent = currentWord.substring(0, charIndex + 1);
      charIndex++;
      typeSpeed = 100;
    }
    
    if (!isDeleting && charIndex === currentWord.length) {
      isDeleting = true;
      typeSpeed = 2000;
    }
    
    if (isDeleting && charIndex === 0) {
      isDeleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      typeSpeed = 500;
    }
    
    setTimeout(typeWriter, typeSpeed);
  }
  
  if (typewriterText) {
    typeWriter();
  }
  
  // Hide custom cursor on mobile/touch devices
  if ('ontouchstart' in window) {
    cursor?.style.setProperty('display', 'none');
    cursorDot?.style.setProperty('display', 'none');
  }
});

window.addEventListener('resize', () => {
  resizeCanvas();
  initParticles();
});

window.addEventListener('scroll', handleScroll);
</script>
