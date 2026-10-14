"""Backend package."""

# WHAT THIS FILE IS FOR
# It marks the folder `backend/app` as a Python package, so other files can
# write imports such as `from app.config import settings`. It has no code.
#
# HOW IT FITS IN
# Every other file in this folder (main.py, models.py, worker.py ...) is a
# module inside this package. Python finds the name `app` only when the
# `backend` folder is the working folder or is on the import path.
