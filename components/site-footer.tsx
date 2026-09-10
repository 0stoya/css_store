import Link from "next/link";

const accreditationImages = [
  { src: "https://beta.chelmsfordsafety.co.uk/media/wysiwyg/global_recycled_standard.png", alt: "Global Recycled Standard" },
  { src: "https://beta.chelmsfordsafety.co.uk/media/wysiwyg/qms_1.png", alt: "Quality management accreditation" },
  { src: "https://beta.chelmsfordsafety.co.uk/media/wysiwyg/bsif_1.png", alt: "BSIF accreditation" },
  { src: "https://beta.chelmsfordsafety.co.uk/media/wysiwyg/sedex.png", alt: "Sedex" },
  { src: "https://beta.chelmsfordsafety.co.uk/media/wysiwyg/risqs.png", alt: "RISQS" },
  { src: "https://beta.chelmsfordsafety.co.uk/media/wysiwyg/cyber.png", alt: "Cyber accreditation" },
];

const website = "https://www.chelmsfordsafety.co.uk";

// Social brand marks are intentionally kept from the existing Chelmsford Safety footer.
// Lucide is used for generic portal UI controls, not as a replacement for brand identities.
function InstagramIcon() {
  return <svg aria-hidden="true" viewBox="0 0 22 23" width="22" height="23" fill="none">
    <circle cx="11" cy="11.8159" r="11" fill="currentColor"/>
    <path d="M11.0137 8.65771C12.7363 8.65771 14.1582 10.0796 14.1582 11.8022C14.1582 13.5522 12.7363 14.9468 11.0137 14.9468C9.26367 14.9468 7.86914 13.5522 7.86914 11.8022C7.86914 10.0796 9.26367 8.65771 11.0137 8.65771ZM11.0137 13.853C12.1348 13.853 13.0371 12.9507 13.0371 11.8022C13.0371 10.6812 12.1348 9.77881 11.0137 9.77881C9.86523 9.77881 8.96289 10.6812 8.96289 11.8022C8.96289 12.9507 9.89258 13.853 11.0137 13.853ZM15.0059 8.54834C15.0059 8.13818 14.6777 7.81006 14.2676 7.81006C13.8574 7.81006 13.5293 8.13818 13.5293 8.54834C13.5293 8.9585 13.8574 9.28662 14.2676 9.28662C14.6777 9.28662 15.0059 8.9585 15.0059 8.54834ZM17.084 9.28662C17.1387 10.2983 17.1387 13.3335 17.084 14.3452C17.0293 15.3296 16.8105 16.1772 16.0996 16.9155C15.3887 17.6265 14.5137 17.8452 13.5293 17.8999C12.5176 17.9546 9.48242 17.9546 8.4707 17.8999C7.48633 17.8452 6.63867 17.6265 5.90039 16.9155C5.18945 16.1772 4.9707 15.3296 4.91602 14.3452C4.86133 13.3335 4.86133 10.2983 4.91602 9.28662C4.9707 8.30225 5.18945 7.42725 5.90039 6.71631C6.63867 6.00537 7.48633 5.78662 8.4707 5.73193C9.48242 5.67725 12.5176 5.67725 13.5293 5.73193C14.5137 5.78662 15.3887 6.00537 16.0996 6.71631C16.8105 7.42725 17.0293 8.30225 17.084 9.28662ZM15.7715 15.4116C16.0996 14.6187 16.0176 12.7046 16.0176 11.8022C16.0176 10.9272 16.0996 9.01318 15.7715 8.19287C15.5527 7.67334 15.1426 7.23584 14.623 7.04443C13.8027 6.71631 11.8887 6.79834 11.0137 6.79834C10.1113 6.79834 8.19727 6.71631 7.4043 7.04443C6.85742 7.26318 6.44727 7.67334 6.22852 8.19287C5.90039 9.01318 5.98242 10.9272 5.98242 11.8022C5.98242 12.7046 5.90039 14.6187 6.22852 15.4116C6.44727 15.9585 6.85742 16.3687 7.4043 16.5874C8.19727 16.9155 10.1113 16.8335 11.0137 16.8335C11.8887 16.8335 13.8027 16.9155 14.623 16.5874C15.1426 16.3687 15.5801 15.9585 15.7715 15.4116Z" fill="#0959A7"/>
  </svg>;
}

function XIcon() {
  return <svg aria-hidden="true" viewBox="0 0 22 23" width="22" height="23" fill="none">
    <circle cx="11" cy="11.8159" r="11" fill="currentColor"/>
    <path d="M14.4507 6.64453H16.2908L12.2707 11.1628L17 17.3112H13.2971L10.3967 13.5823L7.07815 17.3112H5.23696L9.53678 12.4784L5 6.64453H8.79697L11.4186 10.0529L14.4507 6.64453ZM13.8049 16.2281H14.8245L8.24294 7.67072H7.1488L13.8049 16.2281Z" fill="#0959A7"/>
  </svg>;
}

function FacebookIcon() {
  return <svg aria-hidden="true" viewBox="0 0 22 23" width="22" height="23" fill="none">
    <circle cx="11" cy="11.8159" r="11" fill="currentColor"/>
    <path d="M17.7812 11.8569C17.7812 15.2476 15.293 18.064 12.0391 18.5562V13.8257H13.625L13.9258 11.8569H12.0391V10.5991C12.0391 10.0522 12.3125 9.53271 13.1602 9.53271H14.0078V7.86475C14.0078 7.86475 13.2422 7.72803 12.4766 7.72803C10.9453 7.72803 9.93359 8.68506 9.93359 10.3804V11.8569H8.21094V13.8257H9.93359V18.5562C6.67969 18.064 4.21875 15.2476 4.21875 11.8569C4.21875 8.11084 7.25391 5.07568 11 5.07568C14.7461 5.07568 17.7812 8.11084 17.7812 11.8569Z" fill="#0959A7"/>
  </svg>;
}

function LinkedInIcon() {
  return <svg aria-hidden="true" viewBox="0 0 22 23" width="22" height="23" fill="none">
    <circle cx="11" cy="11.8159" r="11" fill="currentColor"/>
    <path d="M16.25 5.69092C16.7148 5.69092 17.125 6.10107 17.125 6.59326V17.0659C17.125 17.5581 16.7148 17.9409 16.25 17.9409H5.72266C5.25781 17.9409 4.875 17.5581 4.875 17.0659V6.59326C4.875 6.10107 5.25781 5.69092 5.72266 5.69092H16.25ZM8.56641 16.1909V10.3667H6.76172V16.1909H8.56641ZM7.66406 9.54639C8.23828 9.54639 8.70312 9.08154 8.70312 8.50732C8.70312 7.93311 8.23828 7.44092 7.66406 7.44092C7.0625 7.44092 6.59766 7.93311 6.59766 8.50732C6.59766 9.08154 7.0625 9.54639 7.66406 9.54639ZM15.375 16.1909V12.9917C15.375 11.4331 15.0195 10.2026 13.1875 10.2026C12.3125 10.2026 11.7109 10.6948 11.4648 11.1597H11.4375V10.3667H9.71484V16.1909H11.5195V13.3198C11.5195 12.5542 11.6562 11.8159 12.6133 11.8159C13.543 11.8159 13.543 12.6909 13.543 13.3472V16.1909H15.375Z" fill="#0959A7"/>
  </svg>;
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return <footer className="site-footer">
    <div className="footer-accreditations-wrap" aria-label="Accreditations and certifications">
      <div className="footer-accreditations">
        {accreditationImages.map((image) => <div className="footer-accreditation" key={image.src}>
          <img src={image.src} alt={image.alt} loading="lazy"/>
        </div>)}
      </div>
    </div>

    <div className="footer-main">
      <div className="footer-grid">
        <section className="footer-column">
          <h2>Customer support</h2>
          <nav aria-label="Customer support">
            <Link href="/account">My account</Link>
            <Link href="/account/orders">Order history</Link>
            <Link href="/account/repeat-orders">Repeat orders</Link>
            <Link href="/account/credit-orders">Credit orders</Link>
            <Link href="/account/returns">Returns</Link>
          </nav>
        </section>

        <section className="footer-column">
          <h2>Useful links</h2>
          <nav aria-label="Useful links">
            <a href={`${website}/sizing-charts`} target="_blank" rel="noopener noreferrer">Sizing charts</a>
            <a href={`${website}/accreditations`} target="_blank" rel="noopener noreferrer">Accreditations</a>
            <a href={`${website}/safety-signs`} target="_blank" rel="noopener noreferrer">Safety signs</a>
            <a href={`${website}/downloads`} target="_blank" rel="noopener noreferrer">Downloads</a>
            <a href={`${website}/faqs`} target="_blank" rel="noopener noreferrer">FAQs</a>
          </nav>
        </section>

        <section className="footer-column footer-address">
          <h2>Find us</h2>
          <address>
            21 Robjohns Road<br/>
            Widford Industrial Estate<br/>
            Chelmsford, CM1 3AG
          </address>
          <a href="https://maps.app.goo.gl/iTAh3JotgB9vSPaX7" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        </section>

        <section className="footer-column">
          <h2>Follow us</h2>
          <div className="footer-socials">
            <a href="https://www.instagram.com/chelmsford_safety/?hl=en" aria-label="Instagram" title="Instagram" target="_blank" rel="noopener noreferrer"><InstagramIcon/></a>
            <a href="https://x.com/ChelmsfordSfty/" aria-label="X" title="X" target="_blank" rel="noopener noreferrer"><XIcon/></a>
            <a href="https://www.facebook.com/chelmsfordsafety/" aria-label="Facebook" title="Facebook" target="_blank" rel="noopener noreferrer"><FacebookIcon/></a>
            <a href="https://www.linkedin.com/company/chelmsford-safety-supplies/" aria-label="LinkedIn" title="LinkedIn" target="_blank" rel="noopener noreferrer"><LinkedInIcon/></a>
          </div>
        </section>
      </div>

      <div className="footer-bottom">
        <div>
          <p>© Chelmsford Safety Supplies Ltd {year} · Company Reg No 7968078 · VAT No 407064476</p>
          <p className="footer-legal-links">
            <a href={`${website}/terms-conditions`} target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
            <a href={`${website}/privacy-policy-cookie-restriction-mode`} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  </footer>;
}
