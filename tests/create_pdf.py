from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def create_dummy_pdf(filename):
    c = canvas.Canvas(filename, pagesize=letter)
    
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 750, "Sample Service Agreement")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawString(100, 720, "Section 1.1: Services")
    c.setFont("Helvetica", 10)
    c.drawString(100, 705, "The Provider shall provide consulting services as described in the Statement of Work.")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawString(100, 670, "Section 1.2: Payment")
    c.setFont("Helvetica", 10)
    c.drawString(100, 655, "The Client shall pay the Provider $100 per hour for all consulting services.")
    
    c.setFont("Helvetica-Bold", 12)
    c.drawString(100, 620, "Section 2.1: Confidentiality")
    c.setFont("Helvetica", 10)
    c.drawString(100, 605, "Both parties agree to maintain the confidentiality of all proprietary information.")
    
    c.showPage()
    c.save()

if __name__ == "__main__":
    create_dummy_pdf("dummy_contract.pdf")
    print("Created dummy_contract.pdf")
