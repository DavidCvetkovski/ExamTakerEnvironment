import os
import sqlalchemy
from sqlalchemy.orm import sessionmaker
from app.core.database import SessionLocal, engine
from app.models import User
from app.core.security import hash_password, verify_password

def fix_passwords():
    db = SessionLocal()
    try:
        print("\n=== FIXING PASSWORDS ===")
        mapping = {
            "admin_e2e@vu.nl": "adminpass123",
            "constructor_e2e@vu.nl": "conpass123",
            "student_e2e@vu.nl": "studentpass123"
        }
        
        for email, new_pass in mapping.items():
            user = db.query(User).filter(User.email == email).first()
            if user:
                # Check if current password matches
                if not verify_password(new_pass, user.hashed_password):
                    print(f"Updating password for {email}...")
                    user.hashed_password = hash_password(new_pass)
                else:
                    print(f"Password for {email} is already correct.")
            else:
                print(f"User {email} not found! (This shouldn't happen if startup ran)")
        
        db.commit()
        print("\nDone fixing passwords.\n")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_passwords()
