"""Generates tests/fixtures/timetable.pdf (grid timetable). Run: python3 make_timetable_pdf.py"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
import os

out = os.path.join(os.path.dirname(__file__), "timetable.pdf")
c = canvas.Canvas(out, pagesize=landscape(A4))
c.setFont("Helvetica-Bold", 14)
c.drawString(40, 560, "Test Institute - Class Timetable")
c.setFont("Helvetica", 10)
c.drawString(40, 540, "Department: CSE    Branch: BTECH    Semester: 3    Section: A")
cols = [("I", 130), ("II", 215), ("III", 300), ("BREAK", 385), ("IV", 450), ("V", 535), ("VI", 620)]
c.setFont("Helvetica-Bold", 10)
for label, x in cols:
    c.drawString(x, 500, label)
x_of = dict(cols)
rows = {
    "MONDAY": {"I": "CS200 (C100)", "II": "CS201 (C100)", "III": "CS 202 (C101)", "IV": "CS203 (C100)"},
    "TUESDAY": {"I": "CS200 (C100)", "II": "XYZ9 (C100)", "V": "CS290 B1 (L1)"},
    "WEDNESDAY": {"I": "CS201 (C100)", "III": "CS202 (C101)"},
    "THURSDAY": {},
    "FRIDAY": {"II": "CS203 (C100)"},
}
y = 470
c.setFont("Helvetica", 9)
for day, cells in rows.items():
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y, day)
    c.setFont("Helvetica", 9)
    for label, text in cells.items():
        c.drawString(x_of[label], y, text)
    if day == "THURSDAY":
        c.drawString(x_of["BREAK"], y, "-")
    y -= 40
c.save()
print("wrote", out)
