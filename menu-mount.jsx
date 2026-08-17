/* ============================================================
   Menu mount — shared across all LARP pages.
   Renders the StaggeredMenu with site navigation + auth area.
   Re-render via window.LARPMenu.render() after session changes.
   ============================================================ */
(function(){
  function currentPage(){
    return (location.pathname.split('/').pop() || 'index.html').split('?')[0];
  }

  function buildMenu(){
    var rootEl = document.getElementById('menu-root');
    if(!rootEl || !window.StaggeredMenu) return null;

    var session = (window.LarpSession && window.LarpSession.current()) || null;
    var here = currentPage();
    var onIndex = here === 'index.html';

    function sec(id){ return onIndex ? ('#' + id) : ('index.html#' + id); }
    function toPage(page){
      if(!session) return page;
      /* Firebase mode: member data never goes in the URL */
      if(window.LarpSession.fbReady()) return page;
      var qs = window.LarpSession.toParams(session).toString();
      return qs ? (page + '?' + qs) : page;
    }
    function pageWithMode(page, mode){
      var p = new URLSearchParams();
      if(mode) p.set('mode', mode);
      if(session && !window.LarpSession.fbReady()){ window.LarpSession.toParams(session).forEach(function(v,k){ p.set(k,v); }); }
      var qs = p.toString();
      return qs ? (page + '?' + qs) : page;
    }

    var items = [
      { label: 'About', ariaLabel: 'Go to about', link: sec('home') },
      { label: 'Manifesto', ariaLabel: 'Go to the manifesto', link: sec('manifesto') },
      { label: 'License', ariaLabel: 'View the license', link: toPage('license.html') },
      { label: 'Membership', ariaLabel: 'Go to membership', link: sec('membership') },
      { label: 'Members', ariaLabel: 'See the member directory', link: toPage('members.html') },
      { label: 'FAQ', ariaLabel: 'Go to the FAQ', link: toPage('faq.html') },
      { label: 'My LARP', ariaLabel: 'Go to your account', link: toPage('account.html') },
      { label: 'My License', ariaLabel: 'View your license', link: toPage('license.html') }
    ];

    var accountLink = session ? toPage('account.html') : pageWithMode('account.html', 'signin');
    var accountLabel = session ? 'MY ACCOUNT' : 'SIGN IN';

    var footerItems;
    if(session){
      footerItems = [
        { label: 'My LARP', link: toPage('account.html') },
        { label: 'My License', link: toPage('license.html') },
        { label: 'Sign out', link: here, modifier: 'signout' }
      ];
    } else {
      footerItems = [
        { label: 'Sign in', link: pageWithMode('account.html', 'signin') },
        { label: 'Become a member', link: pageWithMode('account.html', 'register') }
      ];
    }

    var Menu = window.StaggeredMenu;
    return window.React.createElement(Menu, {
      position: 'right',
      items: items,
      footerItems: footerItems,
      displayFooter: true,
      displaySocials: false,
      displayItemNumbering: true,
      menuButtonColor: '#111111',
      openMenuButtonColor: '#111111',
      changeMenuColorOnOpen: true,
      colors: ['#B497CF', '#5227FF'],
      logoUrl: 'larp-logo.svg',
      faqLink: toPage('faq.html'),
      accountLink: accountLink,
      accountLabel: accountLabel,
      homeLink: toPage('index.html'),
      accentColor: '#5227FF',
      isFixed: true,
      closeOnClickAway: true,
      onMenuOpen: function(){},
      onMenuClose: function(){}
    });
  }

  function render(){
    var rootEl = document.getElementById('menu-root');
    if(!rootEl || !window.StaggeredMenu || !window.ReactDOM) return;
    if(!window.__larpMenuRoot){
      window.__larpMenuRoot = window.ReactDOM.createRoot(rootEl);
    }
    window.__larpMenuRoot.render(buildMenu());
  }

  window.LARPMenu = { render: render };
  render();

  /* re-render the menu whenever the session changes
     (Firebase auth restore, sign in, sign out, edit) */
  if(window.LarpSession && window.LarpSession.onChange){
    window.LarpSession.onChange(function(){ render(); });
  }
})();