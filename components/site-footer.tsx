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
            <a href="https://www.instagram.com/chelmsford_safety/?hl=en" target="_blank" rel="noopener noreferrer">Instagram</a>
            <a href="https://x.com/ChelmsfordSfty/" target="_blank" rel="noopener noreferrer">X</a>
            <a href="https://www.facebook.com/chelmsfordsafety/" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href="https://www.linkedin.com/company/chelmsford-safety-supplies/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
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
        <a href="https://www.fluidcommerce.co.uk/" target="_blank" rel="noopener noreferrer">Ecommerce by Fluid Commerce</a>
      </div>
    </div>
  </footer>;
}
