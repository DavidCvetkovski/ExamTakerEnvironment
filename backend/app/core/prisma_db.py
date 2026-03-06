from prisma import Prisma
import asyncio

# Singleton instance
prisma = Prisma()

async def connect_prisma():
    """Establishes connection to the database."""
    if not prisma.is_connected():
        await prisma.connect()

async def disconnect_prisma():
    """Closes the connection to the database."""
    if prisma.is_connected():
        await prisma.disconnect()

def get_prisma():
    """Dependency for injecting Prisma client into FastAPI endpoints."""
    return prisma
