from abc import ABC, abstractmethod
from typing import List

class StorageProvider(ABC):
    """
    Abstract base class for storage providers that handle browser state persistence.
    """
    
    @abstractmethod
    async def download(self, user_id: str, session_id: str) -> str:
        """
        Downloads a browser session to a local directory.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            
        Returns:
            Path to the local directory containing the session data
        """
        pass
    
    @abstractmethod
    async def upload(self, user_id: str, session_id: str, file_path: str) -> None:
        """
        Uploads a browser session to storage.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            file_path: Path to the local directory containing session data
        """
        pass
    
    @abstractmethod
    async def list_sessions(self, user_id: str) -> List[str]:
        """
        Lists all available sessions for a user.
        
        Args:
            user_id: User identifier
            
        Returns:
            List of session identifiers
        """
        pass
    
    @abstractmethod
    async def delete_session(self, user_id: str, session_id: str) -> None:
        """
        Deletes a browser session.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
        """
        pass 